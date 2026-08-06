/**
 * Payment provider PORT (Ports & Adapters).
 *
 * El dominio habla ESTE contrato, no sabe de MercadoPago ni de ningún proveedor.
 * Para soportar un país nuevo se agrega un adapter (dLocal, PayU, Stripe...),
 * no se toca el dominio.
 */

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

/** Estado de pago normalizado — vocabulario del dominio, agnóstico del proveedor. */
export type NormalizedPaymentStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'refunded';

export interface CheckoutInput {
  bookingId: string;
  amount: number;
  currency: string;
  description: string;
  payerEmail?: string;
  installments?: number;
  successUrl: string;
  failureUrl: string;
  pendingUrl: string;
  notificationUrl: string;
}

export interface CheckoutResult {
  /** Referencia del proveedor (ej: preferenceId de MercadoPago). */
  providerRef: string;
  initPoint: string;
  sandboxInitPoint?: string;
}

export interface CardChargeInput {
  bookingId: string;
  amount: number;
  token: string;
  installments?: number;
  paymentMethodId?: string;
  issuerId?: string;
  payer?: {
    email?: string;
    identification?: { type: string; number: string };
  };
  description?: string;
}

/** Contexto crudo del webhook: lo que hace falta para verificar firma y parsear. */
export interface WebhookContext {
  query: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  /**
   * Body sin parsear. Los proveedores que siguen Standard Webhooks (Polar)
   * firman los BYTES originales: re-serializar con JSON.stringify no los
   * reproduce y la firma da falso negativo.
   */
  rawBody?: Buffer;
}

/** Evento de pago normalizado que el dominio persiste. */
export interface PaymentEvent {
  providerPaymentId: string;
  bookingId: string;
  status: NormalizedPaymentStatus;
  amount?: number;
  currency?: string;
  paymentMethod?: string;
  paymentType?: string;
  dateApproved?: Date;
  statusDetail?: string;
  raw: unknown;
}

export interface PaymentProvider {
  /** Identificador del proveedor: 'mercadopago' | 'dlocal' | 'payu' ... */
  readonly name: string;

  /** Crea un checkout hospedado (redirect). */
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;

  /**
   * Cobro directo con tarjeta tokenizada (Checkout API).
   * Opcional: no todos los proveedores lo soportan.
   */
  chargeCard?(input: CardChargeInput): Promise<PaymentEvent>;

  /** Valida la firma del webhook (HMAC). Debe ser timing-safe. */
  verifyWebhookSignature(ctx: WebhookContext): boolean;

  /**
   * Parsea + re-consulta el evento al proveedor y lo normaliza.
   * Devuelve null si el evento no es de pago (se ignora).
   */
  parseWebhookEvent(ctx: WebhookContext): Promise<PaymentEvent | null>;
}
