import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  CheckoutInput,
  CheckoutResult,
  NormalizedPaymentStatus,
  PaymentEvent,
  PaymentProvider,
  WebhookContext,
} from './payment-provider.interface';

/** Tolerancia de reloj para el timestamp del webhook (anti-replay). */
const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

interface PolarCheckoutResponse {
  id: string;
  url: string;
}

interface PolarOrder {
  id: string;
  status?: string;
  /** Neto: después de descuentos, ANTES de impuestos. NO es lo que pagó el cliente. */
  amount?: number;
  /** Lo que el cliente realmente pagó: después de descuentos E impuestos. */
  total_amount?: number;
  currency?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Adapter de Polar (Merchant of Record). Toda la dependencia con Polar vive ACÁ.
 *
 * Diferencias con MercadoPago que condicionan el diseño:
 * - Checkout exige un `products: [id]` del catálogo. Como el precio varía por
 *   cancha y duración, usamos UN producto fijo (POLAR_PRODUCT_ID) + `amount`
 *   ad-hoc por checkout.
 * - No existe `external_reference`: el bookingId viaja en `metadata` y Polar
 *   lo copia del checkout a la orden.
 * - Webhooks siguen Standard Webhooks: firma sobre el body CRUDO.
 * - No hay cobro directo con tarjeta tokenizada -> `chargeCard` no se implementa.
 */
@Injectable()
export class PolarAdapter implements PaymentProvider {
  readonly name = 'polar';
  private readonly logger = new Logger(PolarAdapter.name);
  private readonly accessToken: string;
  private readonly productId: string;
  private readonly apiBase: string;

  constructor(private readonly config: ConfigService) {
    const accessToken = this.config.get<string>('POLAR_ACCESS_TOKEN');
    if (!accessToken) {
      throw new Error('POLAR_ACCESS_TOKEN is not configured');
    }
    const productId = this.config.get<string>('POLAR_PRODUCT_ID');
    if (!productId) {
      throw new Error('POLAR_PRODUCT_ID is not configured');
    }

    this.accessToken = accessToken;
    this.productId = productId;
    this.apiBase =
      this.config.get<string>('POLAR_SERVER') === 'production'
        ? 'https://api.polar.sh'
        : 'https://sandbox-api.polar.sh';
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    // ponytail: notificationUrl se ignora — Polar configura el webhook a nivel
    // organización en su panel, no por checkout.
    const response = await fetch(`${this.apiBase}/v1/checkouts/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        products: [this.productId],
        // Polar espera el monto en la unidad menor (centavos/centavos de COP).
        amount: Math.round(input.amount * 100),
        currency: input.currency.toLowerCase(),
        // Polar no reenvía metadata en el redirect (MercadoPago sí mandaba
        // external_reference). Sin esto la página de éxito no sabe qué reserva
        // consultar.
        success_url: this.withBookingId(input.successUrl, input.bookingId),
        customer_email: input.payerEmail,
        // Único hilo de vuelta al dominio: Polar copia metadata a la orden.
        metadata: { bookingId: input.bookingId },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Polar checkout failed (${response.status}): ${detail}`);
    }

    const checkout = (await response.json()) as PolarCheckoutResponse;
    if (!checkout.id || !checkout.url) {
      throw new Error('Polar did not return a valid checkout');
    }

    return { providerRef: checkout.id, initPoint: checkout.url };
  }

  /**
   * Standard Webhooks: firma = base64(HMAC-SHA256(secret, `${id}.${ts}.${body}`)).
   * El secreto de Polar se usa tal cual como clave (Polar pide base64-encodearlo
   * porque las libs de Standard Webhooks lo base64-decodean: neto = bytes crudos).
   */
  verifyWebhookSignature(ctx: WebhookContext): boolean {
    const secret = this.config.get<string>('POLAR_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.error(
        'POLAR_WEBHOOK_SECRET is not configured — rejecting webhook',
      );
      return false;
    }

    const id = this.header(ctx, 'webhook-id');
    const timestamp = this.header(ctx, 'webhook-timestamp');
    const signature = this.header(ctx, 'webhook-signature');
    if (!id || !timestamp || !signature || !ctx.rawBody) {
      return false;
    }

    // Anti-replay: un webhook viejo re-enviado por un tercero se rechaza.
    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) {
      return false;
    }
    const skew = Math.abs(Math.floor(Date.now() / 1000) - ts);
    if (skew > TIMESTAMP_TOLERANCE_SECONDS) {
      this.logger.warn(`Rejected webhook with timestamp skew of ${skew}s`);
      return false;
    }

    const expected = createHmac('sha256', Buffer.from(secret, 'utf8'))
      .update(`${id}.${timestamp}.${ctx.rawBody.toString('utf8')}`)
      .digest('base64');

    // El header puede traer varias firmas separadas por espacio: "v1,<sig> v1,<sig>".
    return signature
      .split(' ')
      .some((part) => this.safeEqual(expected, part.split(',')[1] ?? ''));
  }

  parseWebhookEvent(ctx: WebhookContext): Promise<PaymentEvent | null> {
    const body = (ctx.body ?? {}) as { type?: string; data?: PolarOrder };
    const status = this.mapEventType(body.type);
    if (!status || !body.data?.id) {
      return Promise.resolve(null); // no es un evento de orden — se ignora
    }

    const order = body.data;
    const bookingId = String(order.metadata?.bookingId ?? '');
    // `total_amount`, NO `amount`: Polar es Merchant of Record y `amount` es el
    // NETO sin impuestos. Con IVA colombiano al 19% el neto da 84% del precio y
    // el guard de monto del dominio rechazaba un pago correcto.
    const paid = order.total_amount ?? order.amount;

    // A diferencia de MercadoPago no re-consultamos: Standard Webhooks firma el
    // body completo, así que el payload YA es auténtico e íntegro.
    return Promise.resolve({
      providerPaymentId: order.id,
      bookingId,
      status,
      amount: paid != null ? paid / 100 : undefined,
      currency: order.currency,
      paymentMethod: 'polar',
      dateApproved: status === 'succeeded' ? new Date() : undefined,
      statusDetail: body.type,
      raw: body,
    });
  }

  private mapEventType(type?: string): NormalizedPaymentStatus | null {
    const map: Record<string, NormalizedPaymentStatus> = {
      'order.paid': 'succeeded',
      'order.created': 'pending',
      'order.refunded': 'refunded',
    };
    return type ? (map[type] ?? null) : null;
  }

  private safeEqual(expected: string, received: string): boolean {
    const a = Buffer.from(expected);
    const b = Buffer.from(received);
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(a, b);
  }

  private withBookingId(url: string, bookingId: string): string {
    const parsed = new URL(url);
    parsed.searchParams.set('bookingId', bookingId);
    return parsed.toString();
  }

  private header(ctx: WebhookContext, key: string): string | undefined {
    const raw = ctx.headers[key];
    return Array.isArray(raw) ? raw[0] : raw;
  }
}
