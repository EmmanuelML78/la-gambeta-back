import { Logger } from '@nestjs/common';
import { DrizzleQueryError } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';

describe('PaymentsController webhook error handling', () => {
  it('keeps the retryable 500 response without logging Drizzle query values', async () => {
    const sentinel = 'synthetic-bound-value-not-for-logs';
    const service = {
      handleWebhook: jest
        .fn()
        .mockRejectedValue(new DrizzleQueryError('select $1', [sentinel])),
    } as unknown as PaymentsService;
    const controller = new PaymentsController(service);
    const request = {
      query: {},
      headers: {},
      body: {},
      rawBody: Buffer.from('synthetic-webhook-payload'),
    } as unknown as Request;
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const response = {
      status,
      json,
    } as unknown as Response;
    const logError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    try {
      await controller.handleWebhook(request, response);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({
        error: 'Webhook processing failed',
      });
      expect(logError).toHaveBeenCalledWith(
        'Webhook processing error: Database query failed; details redacted',
      );
      expect(JSON.stringify(logError.mock.calls)).not.toContain(sentinel);
      expect(JSON.stringify(json.mock.calls)).not.toContain(sentinel);
    } finally {
      logError.mockRestore();
    }
  });
});
