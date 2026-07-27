import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import {
  CardChargeInput,
  CheckoutInput,
  CheckoutResult,
  NormalizedPaymentStatus,
  PaymentEvent,
  PaymentProvider,
  WebhookContext,
} from './payment-provider.interface';

/**
 * Adapter de MercadoPago. Toda la dependencia con el SDK de MP vive ACÁ.
 * Cubre AR, CO, MX, CL, BR, PE, UY (una cuenta por país).
 */
@Injectable()
export class MercadoPagoAdapter implements PaymentProvider {
  readonly name = 'mercadopago';
  private readonly logger = new Logger(MercadoPagoAdapter.name);
  private readonly client: MercadoPagoConfig;
  private readonly preference: Preference;
  private readonly payment: Payment;

  constructor(private readonly config: ConfigService) {
    const accessToken = this.config.get<string>('MP_ACCESS_TOKEN');
    if (!accessToken) {
      throw new Error('MP_ACCESS_TOKEN is not configured');
    }

    this.client = new MercadoPagoConfig({
      accessToken,
      options: { timeout: 5000 },
    });
    this.preference = new Preference(this.client);
    this.payment = new Payment(this.client);
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const response = await this.preference.create({
      body: {
        items: [
          {
            id: input.bookingId,
            title: input.description,
            description: input.description,
            currency_id: input.currency,
            category_id: 'services',
            quantity: 1,
            unit_price: input.amount,
          },
        ],
        payer: input.payerEmail ? { email: input.payerEmail } : undefined,
        back_urls: {
          success: input.successUrl,
          failure: input.failureUrl,
          pending: input.pendingUrl,
        },
        // MP rechaza auto_return si back_urls.success es localhost
        // ('invalid_auto_return'). Solo lo activamos con URL pública (prod/tunnel).
        ...(input.successUrl.startsWith('http://localhost')
          ? {}
          : { auto_return: 'approved' as const }),
        payment_methods: {
          excluded_payment_methods: [],
          excluded_payment_types: [],
          installments: input.installments ?? 1,
        },
        notification_url: input.notificationUrl,
        statement_descriptor: 'LA GAMBETA',
        external_reference: input.bookingId,
        expires: true,
        expiration_date_from: new Date().toISOString(),
        expiration_date_to: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      },
      // Idempotencia REAL: una key única por request (antes era 'abc' fijo).
      requestOptions: { idempotencyKey: randomUUID() },
    });

    if (!response.id || !response.init_point) {
      throw new Error('MercadoPago did not return a valid preference');
    }

    return {
      providerRef: response.id,
      initPoint: response.init_point,
      sandboxInitPoint: response.sandbox_init_point,
    };
  }

  async chargeCard(input: CardChargeInput): Promise<PaymentEvent> {
    const response = await this.payment.create({
      body: {
        transaction_amount: input.amount,
        token: input.token,
        description: input.description,
        installments: input.installments ?? 1,
        payment_method_id: input.paymentMethodId,
        issuer_id: input.issuerId ? parseInt(input.issuerId, 10) : undefined,
        payer: input.payer ?? {},
        external_reference: input.bookingId,
        metadata: { booking_id: input.bookingId },
      },
      requestOptions: { idempotencyKey: randomUUID() },
    });

    return this.toPaymentEvent(
      response as unknown as Record<string, unknown>,
      input.bookingId,
    );
  }

  verifyWebhookSignature(ctx: WebhookContext): boolean {
    const secret = this.config.get<string>('MP_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.error('MP_WEBHOOK_SECRET is not configured — rejecting webhook');
      return false;
    }

    const signature = this.header(ctx, 'x-signature');
    const requestId = this.header(ctx, 'x-request-id');
    if (!signature || !requestId) {
      return false;
    }

    // x-signature: "ts=1704908010,v1=abcdef..."
    const parts = Object.fromEntries(
      signature.split(',').map((p) => {
        const [k, v] = p.split('=');
        return [k?.trim(), v?.trim()];
      }),
    ) as Record<string, string>;
    const ts = parts['ts'];
    const v1 = parts['v1'];
    if (!ts || !v1) {
      return false;
    }

    // Manifest MP: id:{data.id};request-id:{x-request-id};ts:{ts};
    const dataId = ctx.query['data.id'] ?? ctx.query['id'];
    const manifest =
      (dataId != null ? `id:${String(dataId).toLowerCase()};` : '') +
      `request-id:${requestId};` +
      `ts:${ts};`;

    const expected = createHmac('sha256', secret)
      .update(manifest)
      .digest('hex');

    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
    } catch {
      return false;
    }
  }

  async parseWebhookEvent(ctx: WebhookContext): Promise<PaymentEvent | null> {
    const body = (ctx.body ?? {}) as { type?: string; data?: { id?: string } };
    const type = (ctx.query['type'] as string) ?? body.type;
    if (type !== 'payment') {
      return null;
    }

    const dataId = (ctx.query['data.id'] as string) ?? body.data?.id;
    if (!dataId) {
      return null;
    }

    // Re-consulta al proveedor: nunca confiamos en el body del webhook.
    const mpPayment = (await this.payment.get({
      id: String(dataId),
    })) as unknown as Record<string, unknown>;
    const bookingId = (mpPayment.external_reference as string) ?? '';
    return this.toPaymentEvent(mpPayment, bookingId);
  }

  private toPaymentEvent(
    mp: Record<string, unknown>,
    bookingId: string,
  ): PaymentEvent {
    const dateApproved = mp.date_approved as string | undefined;
    return {
      providerPaymentId: String(mp.id),
      bookingId,
      status: this.mapStatus(mp.status as string),
      amount: mp.transaction_amount as number | undefined,
      currency: mp.currency_id as string | undefined,
      paymentMethod: mp.payment_method_id as string | undefined,
      paymentType: mp.payment_type_id as string | undefined,
      dateApproved: dateApproved ? new Date(dateApproved) : undefined,
      statusDetail: mp.status_detail as string | undefined,
      raw: mp,
    };
  }

  private mapStatus(mpStatus: string): NormalizedPaymentStatus {
    const map: Record<string, NormalizedPaymentStatus> = {
      pending: 'pending',
      approved: 'succeeded',
      authorized: 'succeeded',
      in_process: 'processing',
      in_mediation: 'processing',
      rejected: 'failed',
      cancelled: 'cancelled',
      refunded: 'refunded',
      charged_back: 'refunded',
    };
    return map[mpStatus] ?? 'pending';
  }

  private header(ctx: WebhookContext, key: string): string | undefined {
    const raw = ctx.headers[key];
    return Array.isArray(raw) ? raw[0] : raw;
  }
}
