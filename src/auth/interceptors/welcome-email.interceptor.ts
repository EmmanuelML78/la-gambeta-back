import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Response } from 'express';
import { MailService } from '../../mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { BetterAuthUser } from '../types/oauth.types';

/**
 * Interceptor para enviar email de bienvenida
 * Detecta cuando un usuario verifica su email y le envía un email de bienvenida
 */
@Injectable()
export class WelcomeEmailInterceptor implements NestInterceptor {
  private readonly logger = new Logger(WelcomeEmailInterceptor.name);

  constructor(
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<{ user?: BetterAuthUser }> {
    const request = context.switchToHttp().getRequest<{ url: string }>();
    const response: Response = context.switchToHttp().getResponse();

    // Detectar si es una petición de verificación de email
    const isVerifyEmail = request.url.includes('/verify-email');
    const isSignUp = request.url.includes('/sign-up');

    return next.handle().pipe(
      tap((data: { user?: BetterAuthUser }) => {
        // Solo enviar email de bienvenida si:
        // 1. Es una verificación de email exitosa (status 200)
        // 2. O es un registro sin verificación requerida
        if (response.statusCode === 200 || response.statusCode === 201) {
          // Para verificación de email
          if (isVerifyEmail && data?.user) {
            void this.sendWelcomeEmail(data.user);
          }
          // Para registro directo (sin verificación requerida)
          else if (
            isSignUp &&
            data?.user &&
            (data.user.emailVerified ||
              this.configService.get('REQUIRE_EMAIL_VERIFICATION') === 'false')
          ) {
            void this.sendWelcomeEmail(data.user);
          }
        }
      }),
    );
  }

  private async sendWelcomeEmail(user: BetterAuthUser): Promise<void> {
    try {
      const frontendUrl =
        this.configService.get<string>('FRONTEND_URL') ||
        'http://localhost:3000';

      await this.mailService.sendWelcomeEmail(user.email, {
        firstName: user.firstName || user.name?.split(' ')[0] || 'Usuario',
        lastName: user.lastName || user.name?.split(' ')[1] || '',
        loginUrl: frontendUrl,
      });

      this.logger.log(`✅ Welcome email sent to: ${user.email}`);
    } catch (error) {
      // No lanzar error para no interrumpir la respuesta
      this.logger.error('Error enviando email de bienvenida:', error);
    }
  }
}
