import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';
import { DatabaseModule } from '../database/database.module';
import { BetterAuthGuard } from './guards/better-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { WelcomeEmailInterceptor } from './interceptors/welcome-email.interceptor';
import { createBetterAuth } from './better-auth.config';
import { DrizzleService } from '../database/drizzle.service';
import { MailService } from '../mail/mail.service';

/**
 * AuthModule - Módulo global de autenticación
 * Configura Better Auth y proporciona guards para proteger rutas
 */
@Global()
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    UsersModule,
    MailModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: () => [
        {
          name: 'short',
          ttl: 1000,
          limit: 3,
        },
        {
          name: 'medium',
          ttl: 10000,
          limit: 20,
        },
        {
          name: 'long',
          ttl: 60000,
          limit: 100,
        },
      ],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    BetterAuthGuard,
    RolesGuard,
    WelcomeEmailInterceptor,
    {
      provide: 'BETTER_AUTH',
      useFactory: (
        drizzleService: DrizzleService,
        mailService: MailService,
      ) => {
        return createBetterAuth({ drizzleService, mailService });
      },
      inject: [DrizzleService, MailService],
    },
  ],
  exports: [AuthService, 'BETTER_AUTH', BetterAuthGuard, RolesGuard],
})
export class AuthModule {}
