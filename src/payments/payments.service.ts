import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  Inject,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { DrizzleService } from '../database/drizzle.service';
import {
  payments,
  bookings,
  NewPayment,
  Payment as PaymentEntity,
} from '../database/schema';
import { PaymentStatus, BookingStatus } from '../common/enums';
import { CreatePreferenceDto, ProcessPaymentDto } from './dto';
import {
  PAYMENT_PROVIDER,
  PaymentProvider,
  PaymentEvent,
  NormalizedPaymentStatus,
  WebhookContext,
} from './providers/payment-provider.interface';
import { canReplacePaymentStatus } from './payment-status-transition';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly drizzleService: DrizzleService,
    private readonly configService: ConfigService,
    @Inject(PAYMENT_PROVIDER)
    private readonly provider: PaymentProvider,
  ) {}

  async createPreference(dto: CreatePreferenceDto): Promise<{
    preferenceId: string;
    initPoint: string;
    sandboxInitPoint: string;
  }> {
    const booking = await this.getBookingOrThrow(dto.bookingId);

    // El monto SIEMPRE sale del booking, NUNCA del cliente.
    const amount = parseFloat(booking.totalPrice);
    const currency = dto.currency ?? 'COP';
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    const backendUrl = this.configService.get<string>(
      'BACKEND_URL',
      'http://localhost:3001',
    );

    const checkout = await this.provider.createCheckout({
      bookingId: booking.id,
      amount,
      currency,
      description: dto.description || `Reserva de cancha - ${booking.id}`,
      payerEmail: dto.payerEmail,
      installments: dto.installments,
      successUrl: `${frontendUrl}/payment/success`,
      failureUrl: `${frontendUrl}/payment/failure`,
      pendingUrl: `${frontendUrl}/payment/pending`,
      notificationUrl: `${backendUrl}/api/v1/payments/webhook`,
    });

    const newPayment: NewPayment = {
      bookingId: booking.id,
      mpPreferenceId: checkout.providerRef,
      amount: amount.toString(),
      currency,
      status: PaymentStatus.PENDING,
      installments: dto.installments ?? 1,
      description: dto.description,
      externalReference: booking.id,
    };
    await this.drizzleService.db.insert(payments).values(newPayment);

    await this.drizzleService.db
      .update(bookings)
      .set({ status: BookingStatus.PENDING, updatedAt: new Date() })
      .where(eq(bookings.id, booking.id));

    this.logger.log(
      `Checkout created (${this.provider.name}): ${checkout.providerRef} for booking ${booking.id}`,
    );

    return {
      preferenceId: checkout.providerRef,
      initPoint: checkout.initPoint,
      sandboxInitPoint: checkout.sandboxInitPoint ?? checkout.initPoint,
    };
  }

  async processPayment(dto: ProcessPaymentDto): Promise<{
    paymentId: string;
    status: string;
    statusDetail: string;
  }> {
    if (!this.provider.chargeCard) {
      throw new BadRequestException(
        `Provider ${this.provider.name} does not support direct card charges`,
      );
    }

    const booking = await this.getBookingOrThrow(dto.bookingId);
    // El monto SIEMPRE sale del booking, NUNCA del cliente.
    const amount = parseFloat(booking.totalPrice);

    const event = await this.provider.chargeCard({
      bookingId: booking.id,
      amount,
      token: dto.token,
      installments: dto.installments,
      paymentMethodId: dto.paymentMethodId,
      issuerId: dto.issuerId,
      payer: dto.payer,
      description: dto.description,
    });

    const newPayment: NewPayment = {
      bookingId: booking.id,
      mpPaymentId: event.providerPaymentId,
      amount: amount.toString(),
      currency: event.currency ?? 'ARS',
      status: this.mapNormalizedStatus(event.status),
      paymentMethod: event.paymentMethod,
      paymentType: event.paymentType,
      installments: dto.installments ?? 1,
      description: dto.description,
      externalReference: booking.id,
      dateApproved: event.dateApproved ?? null,
    };
    await this.drizzleService.db.insert(payments).values(newPayment);

    if (event.status === 'succeeded') {
      await this.drizzleService.db
        .update(bookings)
        .set({ status: BookingStatus.ACTIVE, updatedAt: new Date() })
        .where(eq(bookings.id, booking.id));
    }

    this.logger.log(
      `Card charged (${this.provider.name}): ${event.providerPaymentId} for booking ${booking.id}`,
    );

    return {
      paymentId: event.providerPaymentId,
      status: event.status,
      statusDetail: event.statusDetail ?? '',
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
    if (!event.bookingId) {
      this.logger.warn(
        `Webhook payment ${event.providerPaymentId} without external_reference`,
      );
      return;
    }

    await this.persistPaymentEvent(event);
    this.logger.log(
      `Webhook processed: payment ${event.providerPaymentId} -> ${event.status}`,
    );
  }

  private async persistPaymentEvent(event: PaymentEvent): Promise<void> {
    // Sin el guard de "already paid": el webhook debe ser idempotente
    // (MercadoPago reenvía el mismo evento varias veces).
    const [booking] = await this.drizzleService.db
      .select()
      .from(bookings)
      .where(eq(bookings.id, event.bookingId))
      .limit(1);
    if (!booking) {
      this.logger.warn(`Webhook for unknown booking ${event.bookingId}`);
      return;
    }
    const status = this.mapNormalizedStatus(event.status);

    await this.drizzleService.db.transaction(async (tx) => {
      const [payment] = await tx
        .select({ status: payments.status })
        .from(payments)
        .where(eq(payments.bookingId, event.bookingId))
        .limit(1)
        .for('update');

      if (!payment || !canReplacePaymentStatus(payment.status, status)) {
        this.logger.warn(
          `Ignored stale payment status ${status} for booking ${event.bookingId}`,
        );
        return;
      }

      await tx
        .update(payments)
        .set({
          mpPaymentId: event.providerPaymentId,
          status,
          paymentMethod: event.paymentMethod,
          paymentType: event.paymentType,
          dateApproved: event.dateApproved ?? null,
          failureReason: event.statusDetail,
          updatedAt: new Date(),
        })
        .where(eq(payments.bookingId, event.bookingId));

      if (event.status === 'succeeded') {
        // Verificación de monto: no activamos si pagaron menos que el precio.
        const expected = parseFloat(booking.totalPrice);
        if (event.amount != null && event.amount + 0.01 < expected) {
          this.logger.error(
            `Amount mismatch on booking ${event.bookingId}: paid ${event.amount}, expected ${expected}`,
          );
          return;
        }
        await tx
          .update(bookings)
          .set({ status: BookingStatus.ACTIVE, updatedAt: new Date() })
          .where(eq(bookings.id, event.bookingId));
      } else if (event.status === 'cancelled' || event.status === 'failed') {
        await tx
          .update(bookings)
          .set({ status: BookingStatus.CANCELLED, updatedAt: new Date() })
          .where(eq(bookings.id, event.bookingId));
      }
    });
  }

  async getPaymentByBookingId(
    bookingId: string,
  ): Promise<PaymentEntity | null> {
    const result = await this.drizzleService.db
      .select()
      .from(payments)
      .where(eq(payments.bookingId, bookingId))
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

  private async getBookingOrThrow(bookingId: string) {
    const [booking] = await this.drizzleService.db
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    if (booking.status === BookingStatus.ACTIVE) {
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
