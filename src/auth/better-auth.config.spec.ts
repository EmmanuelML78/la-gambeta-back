import { Logger } from '@nestjs/common';
import { createBetterAuth } from './better-auth.config';
import type { DrizzleService } from '../database/drizzle.service';
import type { MailService } from '../mail/mail.service';

jest.mock('better-auth', () => ({
  betterAuth: (options: unknown) => options,
}));

jest.mock('better-auth/adapters/drizzle', () => ({
  drizzleAdapter: () => undefined,
}));

describe('Better Auth server-owned user fields', () => {
  it('excludes role and isActive from client input while preserving defaults', () => {
    const authOptions = createBetterAuth({
      drizzleService: { db: {} } as DrizzleService,
      mailService: {} as MailService,
    }) as unknown as {
      user: {
        additionalFields: {
          role: { input?: boolean; defaultValue?: string };
          isActive: { input?: boolean; defaultValue?: boolean };
        };
      };
      logger: {
        disabled?: boolean;
        log: (level: 'error', message: string, ...args: unknown[]) => void;
      };
    };

    expect(authOptions.user.additionalFields.role).toMatchObject({
      input: false,
      defaultValue: 'USER',
    });
    expect(authOptions.user.additionalFields.isActive).toMatchObject({
      input: false,
      defaultValue: true,
    });
  });

  it('redacts Better Auth logger messages and error arguments without disabling logging', () => {
    const sentinel = 'synthetic-bound-value-not-for-logs';
    const authOptions = createBetterAuth({
      drizzleService: { db: {} } as DrizzleService,
      mailService: {} as MailService,
    }) as unknown as {
      logger: {
        disabled?: boolean;
        log: (level: 'error', message: string, ...args: unknown[]) => void;
      };
    };
    const logError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    try {
      authOptions.logger.log(
        'error',
        `query failed with ${sentinel}`,
        new Error(sentinel),
      );

      expect(authOptions.logger.disabled).not.toBe(true);
      expect(logError).toHaveBeenCalledWith(
        'Better Auth error (details redacted)',
      );
      expect(JSON.stringify(logError.mock.calls)).not.toContain(sentinel);
    } finally {
      logError.mockRestore();
    }
  });
});
