import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BetterAuthInstance } from './better-auth.config';
import { MailService } from '../mail/mail.service';
import { DrizzleService } from '../database/drizzle.service';
import { users } from '../database/schema';
import { eq } from 'drizzle-orm';
import { UserRole } from '../common/enums';

/**
 * AuthService - Servicio auxiliar para Better Auth
 * Better Auth maneja toda la lógica de autenticación automáticamente.
 * Este servicio solo proporciona métodos auxiliares específicos del negocio.
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject('BETTER_AUTH') private readonly auth: BetterAuthInstance,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    private readonly drizzle: DrizzleService,
  ) {}

  /**
   * Envía un email de bienvenida a un nuevo usuario
   * Este método se puede llamar después del registro exitoso
   */
  async sendWelcomeEmail(userId: string): Promise<void> {
    const [user] = await this.drizzle.db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      throw new BadRequestException('Usuario no encontrado');
    }

    const loginUrl = this.configService.get<string>('FRONTEND_URL') ?? '';
    await this.mailService.sendWelcomeEmail(user.email, {
      firstName: user.firstName,
      lastName: user.lastName,
      loginUrl,
    });
  }

  /**
   * Actualiza el rol de un usuario
   */
  async updateUserRole(userId: string, role: string): Promise<void> {
    const userRole = role === 'admin' ? UserRole.ADMIN : UserRole.USER;
    await this.drizzle.db
      .update(users)
      .set({ role: userRole, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  /**
   * Desactiva una cuenta de usuario
   */
  async deactivateUser(userId: string): Promise<void> {
    await this.drizzle.db
      .update(users)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  /**
   * Activa una cuenta de usuario previamente desactivada
   */
  async activateUser(userId: string): Promise<void> {
    await this.drizzle.db
      .update(users)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  /**
   * Obtiene la instancia de Better Auth
   * Útil para acceder a la API de Better Auth desde otros servicios
   */
  getBetterAuth(): BetterAuthInstance {
    return this.auth;
  }
}
