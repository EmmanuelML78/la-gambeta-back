import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { DrizzleService } from '../database/drizzle.service';
import { MailService } from '../mail/mail.service';
import { BetterAuthUser } from './types/oauth.types';
import * as schema from '../database/schema';

export interface BetterAuthConfig {
  drizzleService: DrizzleService;
  mailService: MailService;
}

interface VerificationEmailData {
  user: BetterAuthUser;
  url: string;
  token?: string;
}

export const createBetterAuth = ({
  drizzleService,
  mailService,
}: BetterAuthConfig) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  return betterAuth({
    secret: process.env.BETTER_AUTH_SECRET,
    // baseURL = ORIGIN del backend (sin path). El prefijo global /api/v1 de Nest
    // va en basePath: better-auth matchea el request por basePath, y como Nest
    // sirve todo bajo /api/v1, el basePath DEBE incluirlo o las rutas dan 404.
    baseURL: process.env.BACKEND_URL || 'http://localhost:3001',
    basePath: '/api/v1/auth',

    database: drizzleAdapter(drizzleService.db, {
      provider: 'pg',
      // Better Auth busca los modelos por nombre singular (user/session/account/
      // verification). Nuestro schema los exporta en plural (users/sessions/...),
      // así que hay que mapearlos explícito o tira "model 'user' not found".
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verificationTokens,
      },
    }),

    emailAndPassword: {
      enabled: true,
      requireEmailVerification:
        process.env.REQUIRE_EMAIL_VERIFICATION !== 'false',

      // Handler para envío de email de recuperación de contraseña
      sendResetPassword: async ({ user, url }) => {
        try {
          // Construir URL del frontend para reset de password
          const resetUrl = `${frontendUrl}/reset-password?token=${url.split('token=')[1]}`;

          await mailService.sendPasswordReset(user.email, {
            firstName:
              (user as BetterAuthUser).firstName ||
              user.name.split(' ')[0] ||
              '',
            lastName:
              (user as BetterAuthUser).lastName ||
              user.name.split(' ')[1] ||
              '',
            resetUrl,
            expiresIn: process.env.PASSWORD_RESET_TOKEN_EXPIRY || '1h',
          });

          console.log(`✅ Password reset email sent to: ${user.email}`);
        } catch (error) {
          console.error('❌ Error sending password reset email:', error);
          throw error; // Better Auth necesita saber si falló
        }
      },

      // Configuración de verificación de email

      async sendVerificationEmail({ user, url, token }: VerificationEmailData) {
        try {
          // Construir URL del frontend para verificación
          const verificationUrl = `${frontendUrl}/verify-email?token=${url.split('token=')[1] || token}`;

          await mailService.sendEmailVerification(user.email, {
            firstName: user.firstName || user.name.split(' ')[0] || '',
            lastName: user.lastName || user.name.split(' ')[1] || '',
            verificationUrl,
            expiresIn: process.env.EMAIL_VERIFICATION_TOKEN_EXPIRY || '24h',
          });

          console.log(`✅ Verification email sent to: ${user.email}`);
        } catch (error) {
          console.error('❌ Error sending verification email:', error);
          throw error; // Better Auth necesita saber si falló
        }
      },
    },

    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirectURI: process.env.GOOGLE_CALLBACK_URL || '',
      },
    },

    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // Update session every 24 hours
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5, // Cache for 5 minutes
      },
    },

    user: {
      additionalFields: {
        role: {
          type: 'string',
          required: false,
          input: false,
          // El enum user_role usa labels EN MAYÚSCULA (UserRole.USER = 'USER').
          // 'user' en minúscula rompe el insert: invalid input value for enum.
          defaultValue: 'USER',
        },
        firstName: {
          type: 'string',
          required: true,
        },
        lastName: {
          type: 'string',
          required: true,
        },
        isActive: {
          type: 'boolean',
          required: false,
          input: false,
          defaultValue: true,
        },
      },
    },

    trustedOrigins: [
      frontendUrl,
      'http://localhost:3000',
      'http://localhost:3001',
    ],
  });
};

export type BetterAuthInstance = ReturnType<typeof createBetterAuth>;
