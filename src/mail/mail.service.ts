import { MailerService } from '@nestjs-modules/mailer';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface EmailVerificationContext {
  firstName: string;
  lastName: string;
  verificationUrl: string;
  expiresIn: string;
}

export interface WelcomeEmailContext {
  firstName: string;
  lastName: string;
  loginUrl: string;
}

export interface PasswordResetContext {
  firstName: string;
  lastName: string;
  resetUrl: string;
  expiresIn: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  async sendEmailVerification(
    email: string,
    context: EmailVerificationContext,
  ): Promise<void> {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: '✅ Verifica tu cuenta en El Predio',
        template: 'email-verification',
        context,
      });
      this.logger.log(`Email verification sent to: ${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send verification email to ${email}:`,
        error,
      );
      throw new Error('Failed to send verification email');
    }
  }

  async sendWelcomeEmail(
    email: string,
    context: WelcomeEmailContext,
  ): Promise<void> {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: '🎾 ¡Bienvenido a El Predio!',
        template: 'welcome',
        context,
      });
      this.logger.log(`Welcome email sent to: ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send welcome email to ${email}:`, error);
      throw new Error('Failed to send welcome email');
    }
  }

  async sendPasswordReset(
    email: string,
    context: PasswordResetContext,
  ): Promise<void> {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: '🔒 Restablece tu contraseña - El Predio',
        template: 'password-reset',
        context,
      });
      this.logger.log(`Password reset email sent to: ${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send password reset email to ${email}:`,
        error,
      );
      throw new Error('Failed to send password reset email');
    }
  }

  async sendBookingConfirmation(
    email: string,

    context: any,
  ): Promise<void> {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: '🎾 Confirmación de Reserva - El Predio',
        template: 'booking-confirmation',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        context,
      });
      this.logger.log(`Booking confirmation sent to: ${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send booking confirmation to ${email}:`,
        error,
      );
      throw new Error('Failed to send booking confirmation');
    }
  }
}
