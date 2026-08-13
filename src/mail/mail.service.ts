import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Handlebars from 'handlebars';
import { Transporter } from 'nodemailer';

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
    @Inject('MAIL_TRANSPORT') private readonly transporter: Transporter,
    private readonly configService: ConfigService,
  ) {}

  private async sendTemplate(
    to: string,
    subject: string,
    template: string,
    context: object,
  ): Promise<void> {
    const source = await readFile(
      join(__dirname, 'templates', `${template}.hbs`),
      'utf8',
    );
    const html = Handlebars.compile(source, { strict: true })(context);

    await this.transporter.sendMail({
      from: this.configService.get<string>('MAIL_FROM'),
      to,
      subject,
      html,
    });
  }

  async sendEmailVerification(
    email: string,
    context: EmailVerificationContext,
  ): Promise<void> {
    try {
      await this.sendTemplate(
        email,
        '✅ Verifica tu cuenta en La Gambeta',
        'email-verification',
        context,
      );
      this.logger.log(`Email verification sent to: ${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send verification email to ${email}:`,
        error,
      );
      throw new Error('Failed to send verification email', { cause: error });
    }
  }

  async sendWelcomeEmail(
    email: string,
    context: WelcomeEmailContext,
  ): Promise<void> {
    try {
      await this.sendTemplate(
        email,
        '🎾 ¡Bienvenido a La Gambeta!',
        'welcome',
        context,
      );
      this.logger.log(`Welcome email sent to: ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send welcome email to ${email}:`, error);
      throw new Error('Failed to send welcome email', { cause: error });
    }
  }

  async sendPasswordReset(
    email: string,
    context: PasswordResetContext,
  ): Promise<void> {
    try {
      await this.sendTemplate(
        email,
        '🔒 Restablece tu contraseña - La Gambeta',
        'password-reset',
        context,
      );
      this.logger.log(`Password reset email sent to: ${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send password reset email to ${email}:`,
        error,
      );
      throw new Error('Failed to send password reset email', { cause: error });
    }
  }

  async sendBookingConfirmation(email: string, context: object): Promise<void> {
    try {
      await this.sendTemplate(
        email,
        '🎾 Confirmación de Reserva - La Gambeta',
        'booking-confirmation',
        context,
      );
      this.logger.log(`Booking confirmation sent to: ${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send booking confirmation to ${email}:`,
        error,
      );
      throw new Error('Failed to send booking confirmation', { cause: error });
    }
  }
}
