import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  Inject,
  Logger,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { DrizzleService } from '../database/drizzle.service';
import { OFFICIAL_CURRENCY } from '../common/payment.constants';
import {
  payments,
  bookings,
  paymentEvents,
  auditEvents,
  NewPayment,
  Payment as PaymentEntity,
  PaymentFlow,
} from '../database/schema';
import { PaymentStatus, BookingStatus, UserRole } from '../common/enums';
import { CreatePreferenceDto, ProcessPaymentDto } from './dto';
import {
  PAYMENT_PROVIDER,
  PaymentProvider,
  PaymentEvent,
  NormalizedPaymentStatus,
  WebhookContext,
} from './providers/payment-provider.interface';
import { canReplacePaymentStatus } from './payment-status-transition';
import { parseIdempotencyKey } from './idempotency-key';

const OPEN_PAYMENT_STATUSES = [
  PaymentStatus.PENDING,
  PaymentStatus.PROCESSING,
] as const;
const SUCCESSFUL_PAYMENT_STATUSES = [
  PaymentStatus.SUCCEEDED,
  PaymentStatus.COMPLETED,
] as const;

interface CheckoutAttempt {
  id: string;
  bookingId: string;
  provider: string | null;
  providerCheckoutId: string | null;
  idempotencyKey: string | null;
  checkoutUrl: string | null;
  checkoutExpiresAt: Date | null;
  amount: string;
  currency: string;
  status: PaymentStatus;
  description: string | null;
}

interface CardAttemptResolution {
  attempt: PaymentEntity;
  created: boolean;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly drizzleService: DrizzleService,
    private readonly configService: ConfigService,
    @Inject(PAYMENT_PROVIDER)
    private readonly provider: PaymentProvider,
  ) {}

  async createPreference(
    dto: CreatePreferenceDto,
    userId: string,
    userRole: UserRole,
    rawIdempotencyKey: string | undefined,
  ): Promise<{
    paymentAttemptId: string;
    preferenceId: string;
    initPoint: string;
    sandboxInitPoint: string;
  }> {
    const idempotencyKey = parseIdempotencyKey(rawIdempotencyKey);
    const attempt = await this.resolveOrCreateCheckoutAttempt(
      dto.bookingId,
      idempotencyKey,
      userId,
      userRole,
      dto,
    );
    const booking = await this.getBookingOrThrow(
      dto.bookingId,
      userId,
      userRole,
    );
    if (!(OPEN_PAYMENT_STATUSES as readonly PaymentStatus[]).includes(attempt.status)) {
      if (
        (SUCCESSFUL_PAYMENT_STATUSES as readonly PaymentStatus[]).includes(
          attempt.status,
        )
      ) {
        throw new ConflictException('Booking already has a successful payment');
      }
      throw new ConflictException({
        message: 'Payment attempt is terminal; use a new Idempotency-Key',
        code: 'PAYMENT_ATTEMPT_TERMINAL',
      });
    }
    const cachedPreference = this.checkoutPreferenceFromAttempt(attempt);
    if (cachedPreference) return cachedPreference;
    if (attempt.status === PaymentStatus.PROCESSING) {
      throw this.reconciliationConflict();
    }

    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    const backendUrl = this.configService.get<string>(
      'BACKEND_URL',
      'http://localhost:3001',
    );
    let checkout;
    try {
      checkout = await this.provider.createCheckout({
        paymentAttemptId: attempt.id,
        bookingId: booking.id,
        idempotencyKey: attempt.idempotencyKey ?? idempotencyKey,
        amount: Number(attempt.amount),
        currency: OFFICIAL_CURRENCY,
        description:
          attempt.description ||
          dto.description ||
          `Reserva de cancha - ${booking.id}`,
        payerEmail: dto.payerEmail,
        installments: dto.installments,
        successUrl: `${frontendUrl}/payment/success`,
        failureUrl: `${frontendUrl}/payment/failure`,
        pendingUrl: `${frontendUrl}/payment/pending`,
        notificationUrl: `${backendUrl}/api/v1/payments/webhook`,
      });
    } catch (error) {
      await this.markCheckoutAttemptUncertain(booking.id, attempt.id, error);
      throw new ServiceUnavailableException({
        message: 'Payment provider could not create the checkout',
        code: 'PAYMENT_ATTEMPT_RECONCILIATION_REQUIRED',
      });
    }

    await this.drizzleService.db
      .update(payments)
      .set({
        providerCheckoutId: checkout.providerRef,
        mpPreferenceId: checkout.providerRef,
        checkoutUrl: checkout.initPoint,
        checkoutExpiresAt: checkout.checkoutExpiresAt ?? null,
        failureReason: null,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, attempt.id));

    await this.drizzleService.db
      .update(bookings)
      .set({ status: BookingStatus.PENDING, updatedAt: new Date() })
      .where(
        and(
          eq(bookings.id, booking.id),
          inArray(bookings.status, [
            BookingStatus.DRAFT,
            BookingStatus.CONFIRMED,
            BookingStatus.PENDING,
          ]),
        ),
      );

    this.logger.log(
      `Checkout created (${this.provider.name}): ${checkout.providerRef} for booking ${booking.id}`,
    );

    return {
      paymentAttemptId: attempt.id,
      preferenceId: checkout.providerRef,
      initPoint: checkout.initPoint,
      sandboxInitPoint: checkout.sandboxInitPoint ?? checkout.initPoint,
    };
  }

  async processPayment(
    dto: ProcessPaymentDto,
    userId: string,
    userRole: UserRole,
    rawIdempotencyKey: string | undefined,
  ): Promise<{
    paymentId: string;
    paymentAttemptId: string;
    status: string;
    statusDetail: string;
  }> {
    if (!this.provider.chargeCard) {
      throw new BadRequestException(
        `Provider ${this.provider.name} does not support direct card charges`,
      );
    }

    const booking = await this.getBookingOrThrow(
      dto.bookingId,
      userId,
      userRole,
      true,
    );
    const idempotencyKey = parseIdempotencyKey(rawIdempotencyKey);
    const resolution = await this.resolveOrCreateCardAttempt(
      booking,
      dto,
      idempotencyKey,
    );
    const attempt = resolution.attempt;
    if (!resolution.created) {
      if (attempt.providerPaymentId || attempt.mpPaymentId) {
        return {
          paymentId: attempt.providerPaymentId ?? attempt.mpPaymentId!,
          paymentAttemptId: attempt.id,
          status: attempt.status,
          statusDetail: attempt.failureReason ?? '',
        };
      }
      throw new ConflictException('Payment attempt is already in progress');
    }

    const amount = Number(attempt.amount);
    let event: PaymentEvent;
    try {
      event = await this.provider.chargeCard({
        paymentAttemptId: attempt.id,
        bookingId: booking.id,
        idempotencyKey,
        amount,
        currency: OFFICIAL_CURRENCY,
        token: dto.token,
        installments: dto.installments,
        paymentMethodId: dto.paymentMethodId,
        issuerId: dto.issuerId,
        payer: dto.payer,
        description: dto.description,
      });
    } catch (error) {
      await this.markCardAttemptUncertain(booking.id, attempt.id, error);
      throw new ServiceUnavailableException({
        message: 'Payment provider could not process the charge',
        code: 'PAYMENT_ATTEMPT_RECONCILIATION_REQUIRED',
      });
    }

    if (
      event.currency?.trim().toUpperCase() !== OFFICIAL_CURRENCY ||
      (event.paymentAttemptId && event.paymentAttemptId !== attempt.id) ||
      (event.bookingId && event.bookingId !== booking.id) ||
      (event.amount != null && Math.abs(event.amount - amount) > 0.01)
    ) {
      const error = new BadRequestException(
        'The payment provider returned inconsistent payment data',
      );
      const knownAttemptMatch =
        (!event.paymentAttemptId || event.paymentAttemptId === attempt.id) &&
        (!event.bookingId || event.bookingId === booking.id);
      await this.markCardAttemptUncertain(
        booking.id,
        attempt.id,
        error,
        knownAttemptMatch ? event.providerPaymentId : undefined,
      );
      throw error;
    }

    const status = this.mapNormalizedStatus(event.status);
    const updatedAttempt = await this.drizzleService.db.transaction(async (tx) => {
      const [lockedBooking] = await tx
        .select()
        .from(bookings)
        .where(eq(bookings.id, booking.id))
        .limit(1)
        .for('update');
      if (!lockedBooking) throw new NotFoundException('Booking not found');
      const [current] = await tx
        .select()
        .from(payments)
        .where(eq(payments.id, attempt.id))
        .limit(1)
        .for('update');
      if (!current) throw new NotFoundException('Payment attempt not found');
      if (!canReplacePaymentStatus(current.status, status)) return current;

      const [updated] = await tx
        .update(payments)
        .set({
          mpPaymentId: event.providerPaymentId,
          providerPaymentId: event.providerPaymentId,
          status,
          paymentMethod: event.paymentMethod,
          paymentType: event.paymentType,
          dateApproved: event.dateApproved ?? null,
          failureReason: event.statusDetail ?? null,
          updatedAt: new Date(),
        })
        .where(and(eq(payments.id, current.id), eq(payments.status, current.status)))
        .returning();
      if (!updated) return current;

      await this.insertPaymentEvent(tx, updated, current.status, event, 'direct_payment');
      if (event.status === 'succeeded') {
        await this.applySuccessfulPaymentBookingState(tx, lockedBooking, updated, event, 'direct_payment');
      }
      return updated;
    });

    this.logger.log(
      `Card charged (${this.provider.name}): ${event.providerPaymentId} for booking ${booking.id}`,
    );
    return {
      paymentId:
        updatedAttempt.providerPaymentId ??
        updatedAttempt.mpPaymentId ??
        event.providerPaymentId,
      paymentAttemptId: attempt.id,
      status: updatedAttempt.status,
      statusDetail: updatedAttempt.failureReason ?? '',
    };
  }

  /**
   * Procesa un webhook del proveedor.
   * Valida firma HMAC ANTES de tocar nada. Un webhook sin firma válida se rechaza.
   */
  async handleWebhook(ctx: WebhookContext): Promise<void> {
    if (!this.provider.verifyWebhookSignature(ctx)) {
      this.logger.warn('Rejected webhook with invalid signature');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const event = await this.provider.parseWebhookEvent(ctx);
    if (!event) {
      return; // no es un evento de pago — se ignora
    }
    const persisted = await this.persistPaymentEvent(event);
    if (!persisted) return;
    this.logger.log(
      `Webhook processed: payment ${event.providerPaymentId} -> ${event.status}`,
    );
  }

  private async persistPaymentEvent(event: PaymentEvent): Promise<boolean> {
    if (event.currency?.trim().toUpperCase() !== OFFICIAL_CURRENCY) {
      this.logger.warn(
        `Rejected payment ${event.providerPaymentId} with currency ${event.currency ?? 'unknown'}; expected ${OFFICIAL_CURRENCY}`,
      );
      return false;
    }
    const attempt = await this.findExactPaymentAttempt(event);
    if (!attempt || (event.bookingId && event.bookingId !== attempt.bookingId)) {
      this.logger.warn(
        `Webhook payment ${event.providerPaymentId} could not be correlated to an exact payment attempt`,
      );
      return false;
    }
    const nextStatus = this.mapNormalizedStatus(event.status);

    try {
      return await this.drizzleService.db.transaction(async (tx) => {
        const [booking] = await tx
          .select()
          .from(bookings)
          .where(eq(bookings.id, attempt.bookingId))
          .limit(1)
          .for('update');
        if (!booking) return false;
        if (
          event.status === 'succeeded' &&
          event.amount != null &&
          event.amount + 0.01 < Number(booking.totalPrice)
        ) {
          this.logger.error(
            `Amount mismatch on booking ${booking.id}: paid ${event.amount}, expected ${booking.totalPrice}`,
          );
          return false;
        }
        const [current] = await tx
          .select()
          .from(payments)
          .where(eq(payments.id, attempt.id))
          .limit(1)
          .for('update');
        if (!current || !canReplacePaymentStatus(current.status, nextStatus)) {
          return false;
        }
        const [updated] = await tx
          .update(payments)
          .set({
            mpPaymentId: event.providerPaymentId,
            providerPaymentId: event.providerPaymentId,
            providerCheckoutId: event.providerCheckoutId ?? current.providerCheckoutId,
            status: nextStatus,
            paymentMethod: event.paymentMethod,
            paymentType: event.paymentType,
            dateApproved: event.dateApproved ?? null,
            failureReason: event.statusDetail ?? null,
            updatedAt: new Date(),
          })
          .where(and(eq(payments.id, current.id), eq(payments.status, current.status)))
          .returning();
        if (!updated) return false;
        await this.insertPaymentEvent(tx, updated, current.status, event, 'webhook');

        if (event.status === 'succeeded') {
          await this.applySuccessfulPaymentBookingState(tx, booking, updated, event, 'payment_webhook');
        } else if (event.status === 'cancelled' || event.status === 'failed') {
          await this.cancelBookingIfNoOtherOpenOrSuccessfulAttempt(
            tx,
            booking,
            current.id,
          );
        }
        return true;
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) return false;
      throw error;
    }
  }

  async getPaymentByBookingId(
    bookingId: string,
  ): Promise<PaymentEntity | null> {
    const result = await this.drizzleService.db
      .select()
      .from(payments)
      .where(eq(payments.bookingId, bookingId))
      .orderBy(desc(payments.createdAt), desc(payments.id))
      .limit(1);
    return result[0] || null;
  }

  async getPaymentById(paymentId: string): Promise<PaymentEntity | null> {
    const result = await this.drizzleService.db
      .select()
      .from(payments)
      .where(eq(payments.id, paymentId))
      .limit(1);
    return result[0] || null;
  }

  getPaymentMethods(): { message: string; publicKey: string | undefined } {
    return {
      message: 'Use the public key to get payment methods from the frontend',
      publicKey: this.configService.get<string>('MP_PUBLIC_KEY'),
    };
  }

  private async resolveOrCreateCheckoutAttempt(
    bookingId: string,
    idempotencyKey: string,
    userId: string,
    userRole: UserRole,
    dto: CreatePreferenceDto,
  ): Promise<CheckoutAttempt> {
    try {
      return await this.drizzleService.db.transaction(async (tx) => {
        const [booking] = await tx
          .select()
          .from(bookings)
          .where(eq(bookings.id, bookingId))
          .limit(1)
          .for('update');
        if (!booking) throw new NotFoundException('Booking not found');
        if (userId && userRole !== UserRole.ADMIN && booking.userId !== userId) {
          throw new ForbiddenException('Booking does not belong to this user');
        }

        const [byKey] = await tx
          .select()
          .from(payments)
          .where(and(eq(payments.bookingId, bookingId), eq(payments.idempotencyKey, idempotencyKey)))
          .limit(1)
          .for('update');
        if (byKey) {
          this.assertAttemptFlow(byKey.paymentFlow, PaymentFlow.HOSTED_CHECKOUT);
          if ((SUCCESSFUL_PAYMENT_STATUSES as readonly PaymentStatus[]).includes(byKey.status)) {
            throw new ConflictException('Booking already has a successful payment');
          }
          if (!(OPEN_PAYMENT_STATUSES as readonly PaymentStatus[]).includes(byKey.status)) {
            throw this.terminalAttemptConflict();
          }
          return byKey;
        }

        this.assertBookingCanStartPayment(booking);

        const [successful] = await tx.select().from(payments).where(and(
          eq(payments.bookingId, bookingId),
          inArray(payments.status, [...SUCCESSFUL_PAYMENT_STATUSES]),
        )).limit(1);
        if (successful) throw new ConflictException('Booking already has a successful payment');

        const [open] = await tx.select().from(payments).where(and(
          eq(payments.bookingId, bookingId),
          inArray(payments.status, [...OPEN_PAYMENT_STATUSES]),
        )).orderBy(desc(payments.createdAt), desc(payments.id)).limit(1).for('update');
        if (open) {
          this.assertAttemptFlow(open.paymentFlow, PaymentFlow.HOSTED_CHECKOUT);
          return open;
        }

        const [attempt] = await tx.insert(payments).values({
          bookingId,
          provider: this.provider.name,
          paymentFlow: PaymentFlow.HOSTED_CHECKOUT,
          idempotencyKey,
          amount: Number(booking.totalPrice).toString(),
          currency: OFFICIAL_CURRENCY,
          status: PaymentStatus.PENDING,
          installments: dto.installments ?? 1,
          description: dto.description,
          externalReference: bookingId,
        }).returning();
        if (!attempt) throw new ServiceUnavailableException('Payment attempt could not be created');
        return attempt;
      });
    } catch (error) {
      if (!this.isUniqueViolation(error)) throw error;
      const [winner] = await this.drizzleService.db.select().from(payments).where(and(
        eq(payments.bookingId, bookingId), inArray(payments.status, [...OPEN_PAYMENT_STATUSES]),
      )).orderBy(desc(payments.createdAt), desc(payments.id)).limit(1);
      if (winner) {
        this.assertAttemptFlow(winner.paymentFlow, PaymentFlow.HOSTED_CHECKOUT);
        return winner;
      }
      throw error;
    }
  }

  private async resolveOrCreateCardAttempt(
    booking: { id: string; totalPrice: string },
    dto: ProcessPaymentDto,
    idempotencyKey: string,
  ): Promise<CardAttemptResolution> {
    try {
      return await this.drizzleService.db.transaction(async (tx) => {
        const [lockedBooking] = await tx.select().from(bookings).where(eq(bookings.id, booking.id)).limit(1).for('update');
        if (!lockedBooking) throw new NotFoundException('Booking not found');

        const [sameKey] = await tx.select().from(payments).where(and(
          eq(payments.bookingId, booking.id), eq(payments.idempotencyKey, idempotencyKey),
        )).limit(1).for('update');
        if (sameKey) {
          this.assertAttemptFlow(sameKey.paymentFlow, PaymentFlow.DIRECT_CARD);
          return { attempt: sameKey, created: false };
        }

        this.assertBookingCanStartPayment(lockedBooking);

        const [successful] = await tx.select().from(payments).where(and(
          eq(payments.bookingId, booking.id), inArray(payments.status, [...SUCCESSFUL_PAYMENT_STATUSES]),
        )).limit(1);
        if (successful) throw new ConflictException('Booking already has a successful payment');

        const [open] = await tx.select().from(payments).where(and(
          eq(payments.bookingId, booking.id), inArray(payments.status, [...OPEN_PAYMENT_STATUSES]),
        )).orderBy(desc(payments.createdAt), desc(payments.id)).limit(1).for('update');
        if (open) {
          this.assertAttemptFlow(open.paymentFlow, PaymentFlow.DIRECT_CARD);
          return { attempt: open, created: false };
        }

        const [attempt] = await tx.insert(payments).values({
          bookingId: booking.id,
          provider: this.provider.name,
          paymentFlow: PaymentFlow.DIRECT_CARD,
          idempotencyKey,
          amount: Number(booking.totalPrice).toString(),
          currency: OFFICIAL_CURRENCY,
          status: PaymentStatus.PENDING,
          installments: dto.installments ?? 1,
          description: dto.description,
          externalReference: booking.id,
        }).returning();
        if (!attempt) throw new ServiceUnavailableException('Payment attempt could not be created');
        return { attempt, created: true };
      });
    } catch (error) {
      if (!this.isUniqueViolation(error)) throw error;
      const [winner] = await this.drizzleService.db.select().from(payments).where(and(
        eq(payments.bookingId, booking.id), inArray(payments.status, [...OPEN_PAYMENT_STATUSES]),
      )).orderBy(desc(payments.createdAt), desc(payments.id)).limit(1);
      if (winner) {
        this.assertAttemptFlow(winner.paymentFlow, PaymentFlow.DIRECT_CARD);
        return { attempt: winner, created: false };
      }
      throw error;
    }
  }

  private async markCardAttemptUncertain(
    bookingId: string,
    attemptId: string,
    error: unknown,
    providerPaymentId?: string,
  ): Promise<void> {
    await this.drizzleService.db.transaction(async (tx) => {
      const [booking] = await tx
        .select()
        .from(bookings)
        .where(eq(bookings.id, bookingId))
        .limit(1)
        .for('update');
      if (!booking) return;
      const [attempt] = await tx
        .select()
        .from(payments)
        .where(eq(payments.id, attemptId))
        .limit(1)
        .for('update');
      if (
        !attempt ||
        !(OPEN_PAYMENT_STATUSES as readonly PaymentStatus[]).includes(
          attempt.status,
        )
      ) {
        return;
      }
      const [failed] = await tx
        .update(payments)
        .set({
          status: PaymentStatus.PROCESSING,
          providerPaymentId: providerPaymentId ?? attempt.providerPaymentId,
          mpPaymentId: providerPaymentId ?? attempt.mpPaymentId,
          failureReason:
            error instanceof Error
              ? error.message.slice(0, 500)
              : 'Provider error',
          manualReview: true,
          manualReviewReason: 'Provider outcome is uncertain; reconcile before retrying',
          manualReviewAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(payments.id, attemptId), eq(payments.status, attempt.status)))
        .returning();
      if (!failed) return;
      await tx.insert(paymentEvents).values({
        paymentId: failed.id,
        bookingId: failed.bookingId,
        provider: failed.provider ?? this.provider.name,
        providerEventId: `attempt:${failed.id}:uncertain`,
        fromStatus: attempt.status,
        toStatus: PaymentStatus.PROCESSING,
        actorType: 'system',
        source: 'payment_provider',
        reason: failed.failureReason,
        correlationId: `attempt:${failed.id}`,
        metadata: {
          amount: Number(failed.amount),
          currency: failed.currency,
          errorType: error instanceof Error ? error.name : 'unknown',
        },
      });
      await tx.insert(auditEvents).values({
        actorType: 'system',
        action: 'payment_attempt_uncertain',
        entityType: 'payment',
        entityId: failed.id,
        source: 'payment_provider',
        reason: failed.manualReviewReason,
        correlationId: `attempt:${failed.id}`,
        metadata: { bookingId: failed.bookingId, errorType: error instanceof Error ? error.name : 'unknown' },
      });
    });
  }

  private async markCheckoutAttemptUncertain(
    bookingId: string,
    attemptId: string,
    error: unknown,
  ): Promise<void> {
    await this.drizzleService.db.transaction(async (tx) => {
      const [booking] = await tx.select().from(bookings)
        .where(eq(bookings.id, bookingId)).limit(1).for('update');
      if (!booking) return;
      const [attempt] = await tx.select().from(payments)
        .where(eq(payments.id, attemptId)).limit(1).for('update');
      if (!attempt || !(OPEN_PAYMENT_STATUSES as readonly PaymentStatus[]).includes(attempt.status)) return;
      const reason = error instanceof Error ? error.message.slice(0, 500) : 'Checkout provider error';
      const [uncertain] = await tx.update(payments).set({
        status: PaymentStatus.PROCESSING,
        failureReason: reason,
        manualReview: true,
        manualReviewReason: 'Provider checkout outcome is uncertain; reconcile before retrying',
        manualReviewAt: new Date(),
        updatedAt: new Date(),
      }).where(and(eq(payments.id, attempt.id), eq(payments.status, attempt.status))).returning();
      if (!uncertain) return;
      await tx.insert(paymentEvents).values({
        paymentId: uncertain.id,
        bookingId: uncertain.bookingId,
        provider: uncertain.provider ?? this.provider.name,
        providerEventId: `attempt:${uncertain.id}:checkout-uncertain`,
        fromStatus: attempt.status,
        toStatus: PaymentStatus.PROCESSING,
        actorType: 'system',
        source: 'payment_provider',
        reason,
        correlationId: `attempt:${uncertain.id}`,
        metadata: { flow: PaymentFlow.HOSTED_CHECKOUT, errorType: error instanceof Error ? error.name : 'unknown' },
      });
      await tx.insert(auditEvents).values({
        actorType: 'system',
        action: 'checkout_attempt_uncertain',
        entityType: 'payment',
        entityId: uncertain.id,
        source: 'payment_provider',
        reason: uncertain.manualReviewReason,
        correlationId: `attempt:${uncertain.id}`,
        metadata: { bookingId: uncertain.bookingId, errorType: error instanceof Error ? error.name : 'unknown' },
      });
    });
  }

  private async applySuccessfulPaymentBookingState(
    tx: any,
    booking: typeof bookings.$inferSelect,
    payment: PaymentEntity,
    event: PaymentEvent,
    source: 'direct_payment' | 'payment_webhook',
  ): Promise<void> {
    const paymentEligibleBookingStates: BookingStatus[] = [
      BookingStatus.DRAFT,
      BookingStatus.CONFIRMED,
      BookingStatus.PENDING,
      BookingStatus.PROCESSING,
    ];
    if (paymentEligibleBookingStates.includes(booking.status)) {
      await tx.update(bookings)
        .set({ status: BookingStatus.ACTIVE, updatedAt: new Date() })
        .where(eq(bookings.id, booking.id));
      return;
    }
    if (booking.status === BookingStatus.ACTIVE) return;

    const reason = `Payment succeeded after booking entered ${booking.status}; manual reconciliation required`;
    await tx.update(payments)
      .set({ manualReview: true, manualReviewReason: reason, manualReviewAt: new Date(), updatedAt: new Date() })
      .where(eq(payments.id, payment.id));
    await tx.insert(auditEvents).values({
      actorType: 'system',
      action: 'late_payment_after_booking_terminal',
      entityType: 'payment',
      entityId: payment.id,
      source,
      reason,
      correlationId: `attempt:${payment.id}`,
      metadata: {
        bookingId: booking.id,
        bookingStatus: booking.status,
        providerPaymentId: event.providerPaymentId,
      },
    });
  }

  private async cancelBookingIfNoOtherOpenOrSuccessfulAttempt(
    tx: any,
    booking: typeof bookings.$inferSelect,
    _currentAttemptId: string,
  ): Promise<void> {
    const [otherPayment] = await tx.select().from(payments).where(and(
      eq(payments.bookingId, booking.id),
      inArray(payments.status, [...OPEN_PAYMENT_STATUSES, ...SUCCESSFUL_PAYMENT_STATUSES]),
    )).limit(1);
    const cancellable: BookingStatus[] = [
      BookingStatus.DRAFT,
      BookingStatus.CONFIRMED,
      BookingStatus.PENDING,
      BookingStatus.PROCESSING,
    ];
    if (!otherPayment && cancellable.includes(booking.status)) {
      await tx.update(bookings)
        .set({ status: BookingStatus.CANCELLED, updatedAt: new Date() })
        .where(eq(bookings.id, booking.id));
    }
  }

  private assertBookingCanStartPayment(booking: typeof bookings.$inferSelect): void {
    if (booking.status === BookingStatus.ACTIVE) {
      throw new ConflictException('Booking already has a successful payment');
    }
    const payable: BookingStatus[] = [
      BookingStatus.DRAFT,
      BookingStatus.CONFIRMED,
      BookingStatus.PENDING,
      BookingStatus.PROCESSING,
    ];
    if (!payable.includes(booking.status)) {
      throw new ConflictException('Booking is not eligible for payment');
    }
  }

  private assertAttemptFlow(actual: PaymentFlow, expected: PaymentFlow): void {
    if (actual !== expected) {
      throw new ConflictException({
        message: 'An open payment attempt exists for another payment flow',
        code: 'PAYMENT_FLOW_CONFLICT',
      });
    }
  }

  private terminalAttemptConflict(): ConflictException {
    return new ConflictException({
      message: 'Payment attempt is terminal; use a new Idempotency-Key',
      code: 'PAYMENT_ATTEMPT_TERMINAL',
    });
  }

  private reconciliationConflict(): ConflictException {
    return new ConflictException({
      message: 'Payment attempt requires provider reconciliation before retrying',
      code: 'PAYMENT_ATTEMPT_RECONCILIATION_REQUIRED',
    });
  }

  private async findExactPaymentAttempt(
    event: PaymentEvent,
  ): Promise<PaymentEntity | null> {
    if (event.paymentAttemptId) {
      const [attempt] = await this.drizzleService.db
        .select()
        .from(payments)
        .where(eq(payments.id, event.paymentAttemptId))
        .limit(1);
      if (
        !attempt ||
        (attempt.provider && attempt.provider !== this.provider.name) ||
        (event.bookingId && attempt.bookingId !== event.bookingId) ||
        (attempt.providerPaymentId &&
          attempt.providerPaymentId !== event.providerPaymentId &&
          attempt.mpPaymentId !== event.providerPaymentId)
      ) {
        return null;
      }
      return attempt;
    }

    const byProviderPaymentId = await this.drizzleService.db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.provider, this.provider.name),
          eq(payments.providerPaymentId, event.providerPaymentId),
        ),
      )
      .limit(2);
    if (byProviderPaymentId.length === 1) return byProviderPaymentId[0];
    if (byProviderPaymentId.length > 1) return null;

    const byLegacyId = await this.drizzleService.db
      .select()
      .from(payments)
      .where(eq(payments.mpPaymentId, event.providerPaymentId))
      .limit(2);
    if (
      byLegacyId.length === 1 &&
      (!byLegacyId[0].provider || byLegacyId[0].provider === this.provider.name)
    ) {
      return byLegacyId[0];
    }
    return null;
  }

  private async insertPaymentEvent(
    tx: any,
    attempt: PaymentEntity,
    fromStatus: PaymentStatus,
    event: PaymentEvent,
    source: 'direct_payment' | 'webhook',
  ): Promise<void> {
    const providerEventId =
      event.providerEventId ??
      `payment:${createHash('sha256')
        .update(
          JSON.stringify({
            paymentAttemptId: attempt.id,
            providerPaymentId: event.providerPaymentId,
            status: attempt.status,
            amount: event.amount,
            currency: event.currency,
            dateApproved: event.dateApproved?.toISOString(),
            statusDetail: event.statusDetail,
          }),
        )
        .digest('hex')}`;
    await tx.insert(paymentEvents).values({
      paymentId: attempt.id,
      bookingId: attempt.bookingId,
      provider: attempt.provider ?? this.provider.name,
      providerEventId,
      fromStatus,
      toStatus: attempt.status,
      actorType: 'provider',
      actorId: this.provider.name,
      source,
      reason: event.statusDetail ?? null,
      correlationId: `attempt:${attempt.id}`,
      metadata: {
        amount: event.amount ?? Number(attempt.amount),
        currency: event.currency ?? attempt.currency,
      },
    });
  }

  private checkoutPreferenceFromAttempt(attempt: CheckoutAttempt) {
    if (!attempt.providerCheckoutId || !attempt.checkoutUrl) return undefined;
    return {
      paymentAttemptId: attempt.id,
      preferenceId: attempt.providerCheckoutId,
      initPoint: attempt.checkoutUrl,
      sandboxInitPoint: attempt.checkoutUrl,
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505'
    );
  }

  private async getBookingOrThrow(
    bookingId: string,
    userId?: string,
    userRole?: UserRole,
    allowAlreadyPaid = false,
  ) {
    const [booking] = await this.drizzleService.db
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    if (
      userId &&
      userRole !== UserRole.ADMIN &&
      booking.userId !== userId
    ) {
      throw new ForbiddenException('Booking does not belong to this user');
    }
    if (booking.status === BookingStatus.ACTIVE && !allowAlreadyPaid) {
      throw new BadRequestException('Booking is already paid');
    }
    return booking;
  }

  private mapNormalizedStatus(s: NormalizedPaymentStatus): PaymentStatus {
    switch (s) {
      case 'succeeded':
        return PaymentStatus.SUCCEEDED;
      case 'processing':
        return PaymentStatus.PROCESSING;
      case 'failed':
        return PaymentStatus.FAILED;
      case 'cancelled':
        return PaymentStatus.CANCELLED;
      case 'refunded':
        return PaymentStatus.REFUNDED;
      default:
        return PaymentStatus.PENDING;
    }
  }
}
