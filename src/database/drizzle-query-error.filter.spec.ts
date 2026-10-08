import { ArgumentsHost, Logger } from '@nestjs/common';
import { DrizzleQueryError } from 'drizzle-orm';
import { Response } from 'express';
import { DrizzleQueryErrorFilter } from './drizzle-query-error.filter';

describe('DrizzleQueryErrorFilter', () => {
  it('returns a static 500 response and logs no query details', () => {
    const sentinel = 'synthetic-bound-value-not-for-logs';
    const error = new DrizzleQueryError('select $1', [sentinel]);
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const response = {
      status,
      json,
    } as unknown as Response;
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost;
    const logError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    try {
      new DrizzleQueryErrorFilter().catch(error, host);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({
        statusCode: 500,
        message: 'Internal server error',
      });
      expect(logError).toHaveBeenCalledWith(
        'Database query failed; details redacted',
      );
      expect(JSON.stringify(logError.mock.calls)).not.toContain(sentinel);
      expect(JSON.stringify(json.mock.calls)).not.toContain(sentinel);
    } finally {
      logError.mockRestore();
    }
  });
});
