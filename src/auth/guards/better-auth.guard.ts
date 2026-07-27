import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Inject,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { BetterAuthInstance } from '../better-auth.config';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { BetterAuthUser, BetterAuthSession } from '../types/oauth.types';

/**
 * Guard de autenticación usando Better Auth
 * Valida sesiones y protege rutas automáticamente
 */
@Injectable()
export class BetterAuthGuard implements CanActivate {
  private readonly logger = new Logger(BetterAuthGuard.name);

  constructor(
    @Inject('BETTER_AUTH') private readonly auth: BetterAuthInstance,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Verificar si la ruta es pública
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user: BetterAuthUser; session: BetterAuthSession }>();

    try {
      // Obtener la sesión desde Better Auth
      const session = await this.auth.api.getSession({
        headers: request.headers,
      });

      // Validar que existe sesión y usuario
      if (!session || !session.user) {
        this.logger.warn('Intento de acceso sin sesión válida');
        throw new UnauthorizedException('No hay sesión activa');
      }

      // Verificar que el usuario esté activo
      const user = session.user as BetterAuthUser;
      if (user.isActive === false) {
        this.logger.warn(
          `Intento de acceso de usuario desactivado: ${user.email}`,
        );
        throw new UnauthorizedException(
          'Cuenta desactivada. Contacte al administrador.',
        );
      }

      // Verificar que el email esté verificado si es requerido
      if (
        !user.emailVerified &&
        process.env.REQUIRE_EMAIL_VERIFICATION === 'true'
      ) {
        this.logger.warn(
          `Intento de acceso con email no verificado: ${user.email}`,
        );
        throw new UnauthorizedException(
          'Email no verificado. Por favor verifica tu email.',
        );
      }

      // Adjuntar usuario y sesión al request para uso en controladores
      request.user = session.user as BetterAuthUser;
      request.session = session.session as BetterAuthSession;

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      this.logger.error('Error validando sesión:', error);
      throw new UnauthorizedException('Sesión inválida o expirada');
    }
  }
}
