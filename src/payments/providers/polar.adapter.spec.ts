import { createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PolarAdapter } from './polar.adapter';
import { WebhookContext } from './payment-provider.interface';

const SECRET = 'test-webhook-secret';
const BOOKING_ID = '123e4567-e89b-12d3-a456-426614174000';

function buildAdapter(): PolarAdapter {
  const config = {
    get: (key: string) => {
      if (key === 'POLAR_ACCESS_TOKEN') return 'polar_oat_test';
      if (key === 'POLAR_PRODUCT_ID') return 'prod_test';
      if (key === 'POLAR_WEBHOOK_SECRET') return SECRET;
      return undefined;
    },
  } as unknown as ConfigService;
  return new PolarAdapter(config);
}

function nowSeconds(): string {
  return String(Math.floor(Date.now() / 1000));
}

function signedCtx(
  payload: unknown,
  id = 'msg_1',
  ts = nowSeconds(),
): WebhookContext {
  const rawBody = Buffer.from(JSON.stringify(payload), 'utf8');
  const signature = createHmac('sha256', Buffer.from(SECRET, 'utf8'))
    .update(`${id}.${ts}.${rawBody.toString('utf8')}`)
    .digest('base64');
  return {
    query: {},
    headers: {
      'webhook-id': id,
      'webhook-timestamp': ts,
      'webhook-signature': `v1,${signature}`,
    },
    body: payload,
    rawBody,
  };
}

// Montos reales de Polar con IVA colombiano al 19%: el cliente paga 90.000 COP
// (total_amount) y el neto sin impuesto es 75.630,25 (amount).
const ORDER_PAID = {
  type: 'order.paid',
  data: {
    id: 'ord_123',
    amount: 7563025,
    total_amount: 9000000,
    currency: 'cop',
    metadata: { bookingId: BOOKING_ID },
  },
};

describe('PolarAdapter.verifyWebhookSignature', () => {
  const adapter = buildAdapter();

  it('accepts a correctly signed webhook', () => {
    expect(adapter.verifyWebhookSignature(signedCtx(ORDER_PAID))).toBe(true);
  });

  it('rejects a tampered signature', () => {
    const ctx = signedCtx(ORDER_PAID);
    ctx.headers['webhook-signature'] = 'v1,ZGVhZGJlZWY=';
    expect(adapter.verifyWebhookSignature(ctx)).toBe(false);
  });

  it('rejects a tampered body (signature covers raw bytes)', () => {
    const ctx = signedCtx(ORDER_PAID);
    ctx.rawBody = Buffer.from(
      JSON.stringify({
        ...ORDER_PAID,
        data: { ...ORDER_PAID.data, amount: 1 },
      }),
      'utf8',
    );
    expect(adapter.verifyWebhookSignature(ctx)).toBe(false);
  });

  it('rejects a replayed webhook outside the timestamp tolerance', () => {
    const stale = String(Math.floor(Date.now() / 1000) - 3600);
    expect(
      adapter.verifyWebhookSignature(signedCtx(ORDER_PAID, 'msg_1', stale)),
    ).toBe(false);
  });

  it('rejects when rawBody is missing', () => {
    const ctx = signedCtx(ORDER_PAID);
    delete ctx.rawBody;
    expect(adapter.verifyWebhookSignature(ctx)).toBe(false);
  });

  it('rejects when signature headers are missing', () => {
    expect(
      adapter.verifyWebhookSignature({ query: {}, headers: {}, body: {} }),
    ).toBe(false);
  });
});

describe('PolarAdapter.parseWebhookEvent', () => {
  const adapter = buildAdapter();

  it('normalizes order.paid into a succeeded event', async () => {
    const event = await adapter.parseWebhookEvent(signedCtx(ORDER_PAID));
    expect(event).toMatchObject({
      providerPaymentId: 'ord_123',
      bookingId: BOOKING_ID,
      status: 'succeeded',
      // Lo que PAGÓ el cliente (total_amount), no el neto sin IVA. Si acá
      // apareciera 75630.25 el guard de monto del dominio rechazaría un pago
      // legítimo y la reserva nunca se activaría.
      amount: 90000,
      currency: 'cop',
    });
  });

  it('falls back to amount when total_amount is absent', async () => {
    const ctx = signedCtx({
      type: 'order.paid',
      data: { id: 'ord_9', amount: 5000, metadata: { bookingId: BOOKING_ID } },
    });
    expect(await adapter.parseWebhookEvent(ctx)).toMatchObject({ amount: 50 });
  });

  it('ignores events without a string bookingId', async () => {
    const ctx = signedCtx({
      type: 'order.paid',
      data: { id: 'ord_10', amount: 5000, metadata: { bookingId: {} } },
    });

    expect(await adapter.parseWebhookEvent(ctx)).toBeNull();
  });

  it('ignores non-order events', async () => {
    const ctx = signedCtx({ type: 'checkout.created', data: { id: 'chk_1' } });
    expect(await adapter.parseWebhookEvent(ctx)).toBeNull();
  });
});

describe('PolarAdapter.createCheckout idempotency', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('forwards the durable attempt identity and idempotency key', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'checkout-1', url: 'https://checkout.test/1' }),
    } as Response);
    const adapter = buildAdapter();

    await adapter.createCheckout({
      paymentAttemptId: '223e4567-e89b-12d3-a456-426614174000',
      bookingId: BOOKING_ID,
      idempotencyKey: 'checkout-key-0001',
      amount: 90000,
      currency: 'COP',
      description: 'Booking checkout',
      successUrl: 'https://app.test/payment/success',
      failureUrl: 'https://app.test/payment/failure',
      pendingUrl: 'https://app.test/payment/pending',
      notificationUrl: 'https://api.test/payments/webhook',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Idempotency-Key': 'checkout-key-0001',
        }),
        body: expect.stringContaining(
          '"paymentAttemptId":"223e4567-e89b-12d3-a456-426614174000"',
        ),
      }),
    );
  });
});
