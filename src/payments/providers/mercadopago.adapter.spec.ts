import { createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { MercadoPagoAdapter } from './mercadopago.adapter';
import { WebhookContext } from './payment-provider.interface';

const SECRET = 'test-webhook-secret';

function buildAdapter(): MercadoPagoAdapter {
  const config = {
    get: (key: string) => {
      if (key === 'MP_ACCESS_TOKEN') return 'TEST-access-token';
      if (key === 'MP_WEBHOOK_SECRET') return SECRET;
      return undefined;
    },
  } as unknown as ConfigService;
  return new MercadoPagoAdapter(config);
}

function signedCtx(dataId: string, requestId: string, ts: string): WebhookContext {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac('sha256', SECRET).update(manifest).digest('hex');
  return {
    query: { 'data.id': dataId, type: 'payment' },
    headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId },
    body: {},
  };
}

describe('MercadoPagoAdapter.verifyWebhookSignature', () => {
  const adapter = buildAdapter();

  it('accepts a correctly signed webhook', () => {
    expect(adapter.verifyWebhookSignature(signedCtx('12345', 'req-1', '1700000000'))).toBe(true);
  });

  it('rejects a tampered signature', () => {
    const ctx = signedCtx('12345', 'req-1', '1700000000');
    ctx.headers['x-signature'] = 'ts=1700000000,v1=deadbeef';
    expect(adapter.verifyWebhookSignature(ctx)).toBe(false);
  });

  it('rejects when data.id is tampered (manifest mismatch)', () => {
    const ctx = signedCtx('12345', 'req-1', '1700000000');
    ctx.query['data.id'] = '99999'; // firma se calculó para 12345
    expect(adapter.verifyWebhookSignature(ctx)).toBe(false);
  });

  it('rejects when signature headers are missing', () => {
    expect(
      adapter.verifyWebhookSignature({ query: {}, headers: {}, body: {} }),
    ).toBe(false);
  });
});
