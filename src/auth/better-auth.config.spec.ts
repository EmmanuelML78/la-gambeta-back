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
});
