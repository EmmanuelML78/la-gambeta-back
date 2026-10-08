'use strict';

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const request = require('supertest');
const { eq } = require('drizzle-orm');

const TEST_DATABASE_NAME = 'la_gambeta_auth_e2e';
const TEST_ONLY_AUTH_SECRET =
  'e2e-only-better-auth-secret-that-is-not-for-production';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const envKeysToRestore = [
  'BETTER_AUTH_SECRET',
  'BACKEND_URL',
  'FRONTEND_URL',
  'REQUIRE_EMAIL_VERIFICATION',
];

function assertIsolatedDatabaseConfiguration() {
  const host = process.env.DATABASE_HOST?.trim().toLowerCase();
  const port = Number(process.env.DATABASE_PORT);

  if (!host || !LOOPBACK_HOSTS.has(host)) {
    throw new Error(
      'Auth integration tests require DATABASE_HOST to be localhost, 127.0.0.1, or ::1.',
    );
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      'Auth integration tests require a valid explicit DATABASE_PORT.',
    );
  }

  if (process.env.DATABASE_NAME !== TEST_DATABASE_NAME) {
    throw new Error(
      `Auth integration tests only run against the dedicated ${TEST_DATABASE_NAME} database.`,
    );
  }

  if (
    !process.env.DATABASE_USERNAME ||
    !process.env.DATABASE_PASSWORD ||
    process.env.DATABASE_SSL !== 'false'
  ) {
    throw new Error(
      'Auth integration tests require explicit DATABASE_USERNAME, DATABASE_PASSWORD, and DATABASE_SSL=false.',
    );
  }
}

test('Nest auth persists server-owned fields and blocks self-service changes', async () => {
  assertIsolatedDatabaseConfiguration();

  const originalEnv = new Map(
    envKeysToRestore.map((key) => [key, process.env[key]]),
  );
  let app;
  let moduleFixture;
  let drizzle;
  let originalQueryLogger;
  let queryLoggerCaptured = false;
  let email;

  process.env.BETTER_AUTH_SECRET = TEST_ONLY_AUTH_SECRET;
  process.env.BACKEND_URL = 'http://localhost:3001';
  process.env.FRONTEND_URL = 'http://localhost:3000';
  process.env.REQUIRE_EMAIL_VERIFICATION = 'false';

  try {
    // Load decorated TypeScript only after the safety guard and test-only env are in place.
    const { Test } = require('@nestjs/testing');
    const { AppModule } = require('../src/app.module.ts');
    const { DrizzleService } = require('../src/database/drizzle.service.ts');
    const { MailService } = require('../src/mail/mail.service.ts');
    const {
      PAYMENT_PROVIDER,
    } = require('../src/payments/providers/payment-provider.interface.ts');

    const testMailService = {
      sendWelcomeEmail: async () => undefined,
      sendPasswordReset: async () => undefined,
      sendEmailVerification: async () => undefined,
      sendEmail: async () => undefined,
    };
    const testPaymentProvider = {
      name: 'auth-integration-test',
      createCheckout: async () => {
        throw new Error('Payment provider must not be used by the auth test');
      },
      verifyWebhookSignature: () => false,
      parseWebhookEvent: async () => null,
    };

    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailService)
      .useValue(testMailService)
      .overrideProvider(PAYMENT_PROVIDER)
      .useValue(testPaymentProvider)
      .compile();

    drizzle = moduleFixture.get(DrizzleService);
    originalQueryLogger = drizzle.db.session.logger;
    queryLoggerCaptured = true;
    drizzle.db.session.logger = { logQuery: () => undefined };
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    email = `auth-fields-${randomUUID()}@example.test`;
    const firstName = 'Auth';
    const lastName = 'Regression';

    const signup = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up/email')
      .send({
        name: `${firstName} ${lastName}`,
        firstName,
        lastName,
        email,
        password: 'Test-only-password-42!',
        role: 'ADMIN',
        isActive: false,
      })
      .expect(200);

    const cookies = signup.headers['set-cookie'];
    assert.ok(cookies, 'signup should return the authenticated session cookie');

    const profile = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Cookie', cookies)
      .expect(200);

    assert.deepEqual(
      {
        email: profile.body.email,
        role: profile.body.role,
        isActive: profile.body.isActive,
      },
      { email, role: 'USER', isActive: true },
    );

    const updatedName = 'Auth Regression Updated';
    await request(app.getHttpServer())
      .post('/api/v1/auth/update-user')
      .set('Cookie', cookies)
      .set('Origin', 'http://localhost:3000')
      .send({ name: updatedName })
      .expect(200);

    const profileAfterNameUpdate = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Cookie', cookies)
      .expect(200);

    assert.deepEqual(
      {
        email: profileAfterNameUpdate.body.email,
        name: profileAfterNameUpdate.body.name,
        role: profileAfterNameUpdate.body.role,
        isActive: profileAfterNameUpdate.body.isActive,
      },
      { email, name: updatedName, role: 'USER', isActive: true },
    );

    for (const attemptedUpdate of [{ role: 'ADMIN' }, { isActive: false }]) {
      const updateResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/update-user')
        .set('Cookie', cookies)
        .set('Origin', 'http://localhost:3000')
        .send(attemptedUpdate);

      assert.equal(updateResponse.status, 400);

      const persistedProfile = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Cookie', cookies)
        .expect(200);

      assert.deepEqual(
        {
          email: persistedProfile.body.email,
          role: persistedProfile.body.role,
          isActive: persistedProfile.body.isActive,
        },
        { email, role: 'USER', isActive: true },
      );
    }

    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Cookie', cookies)
      .send({ role: 'ADMIN' })
      .expect(400);

    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Cookie', cookies)
      .send({ isActive: false })
      .expect(400);

    const unchangedProfile = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Cookie', cookies)
      .expect(200);

    assert.deepEqual(
      {
        email: unchangedProfile.body.email,
        role: unchangedProfile.body.role,
        isActive: unchangedProfile.body.isActive,
      },
      { email, role: 'USER', isActive: true },
    );
  } finally {
    try {
      if (email && drizzle) {
        const { users } = require('../src/database/schema.ts');
        await drizzle.db.delete(users).where(eq(users.email, email));
      }
    } finally {
      try {
        await app?.close();
      } finally {
        try {
          if (drizzle) {
            await drizzle.db.$client.end({ timeout: 5 });
          } else {
            await moduleFixture?.close();
          }
        } finally {
          try {
            if (drizzle && queryLoggerCaptured) {
              drizzle.db.session.logger = originalQueryLogger;
            }
          } finally {
            for (const key of envKeysToRestore) {
              const value = originalEnv.get(key);
              if (value === undefined) {
                delete process.env[key];
              } else {
                process.env[key] = value;
              }
            }
          }
        }
      }
    }
  }
});
