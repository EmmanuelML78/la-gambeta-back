import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

// Core Application
import { AppController } from './app.controller';
import { AppService } from './app.service';

// Infrastructure
import { DatabaseModule } from './database/database.module';
import { DrizzleQueryErrorFilter } from './database/drizzle-query-error.filter';
// import { LoggerModule } from './shared/utils/logger.module';

// Feature Modules
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MailModule } from './mail/mail.module';
import { CourtsModule } from './courts/courts.module';
import { VenuesModule } from './venues/venues.module';
import { BookingsModule } from './bookings/bookings.module';
import { PaymentsModule } from './payments/payments.module';
import { ReservationsModule } from './reservations/reservations.module';
// import { CourtsProfessionalModule } from './courts/courts.module.professional';

// Guards, Interceptors, and Pipes
import { BetterAuthGuard } from './auth/guards/better-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
// import { AdvancedValidationPipe } from './shared/pipes/validation.pipe';
// import { LoggingInterceptor } from './shared/interceptors/logging.interceptor';
// import { TransformInterceptor } from './shared/interceptors/transform.interceptor';
// import { TimeoutInterceptor } from './shared/interceptors/timeout.interceptor';

// Constants
// import { RATE_LIMITS } from './core/constants/app.constants';
import { ValidationPipe } from '@nestjs/common';

@Module({
  imports: [
    // Global Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      cache: true,
      expandVariables: true,
    }),

    // Rate Limiting
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 60000,
        limit: 10,
      },
      {
        name: 'auth',
        ttl: 900000,
        limit: 5,
      },
    ]),

    // Infrastructure Modules
    // LoggerModule,
    DatabaseModule,

    // Feature Modules
    AuthModule,
    UsersModule,
    MailModule,
    CourtsModule,
    VenuesModule,
    BookingsModule,
    PaymentsModule,
    ReservationsModule,
    // CourtsProfessionalModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,

    {
      provide: APP_FILTER,
      useClass: DrizzleQueryErrorFilter,
    },

    // Global Guards — el orden importa:
    // 1) BetterAuthGuard adjunta req.user, 2) RolesGuard lo lee.
    {
      provide: APP_GUARD,
      useClass: BetterAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },

    // Global Pipes
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    },

    // Global Interceptors
    // {
    //   provide: APP_INTERCEPTOR,
    //   useClass: LoggingInterceptor,
    // },
    // {
    //   provide: APP_INTERCEPTOR,
    //   useClass: TransformInterceptor,
    // },
    // {
    //   provide: APP_INTERCEPTOR,
    //   useValue: new TimeoutInterceptor(30000), // 30 seconds timeout
    // },
  ],
})
export class AppModule {}
