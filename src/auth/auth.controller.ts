import { Controller, All, Req, Res, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiExcludeController } from '@nestjs/swagger';
import {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import { toNodeHandler } from 'better-auth/node';
import { Inject } from '@nestjs/common';
import { BetterAuthInstance } from './better-auth.config';
import { Public } from './decorators/public.decorator';
import { WelcomeEmailInterceptor } from './interceptors/welcome-email.interceptor';

/**
 * AuthController - Maneja todas las rutas de autenticación usando Better Auth
 * Better Auth proporciona endpoints automáticos para:
 * - Registro: POST /auth/sign-up/email
 * - Login: POST /auth/sign-in/email
 * - Logout: POST /auth/sign-out
 * - Verificación de email: POST /auth/verify-email
 * - Reset de password: POST /auth/forgot-password, POST /auth/reset-password
 * - OAuth: GET /auth/sign-in/google
 */
@ApiTags('Authentication')
@ApiExcludeController() // Excluir de Swagger ya que Better Auth tiene sus propios endpoints
@Controller('auth')
@UseInterceptors(WelcomeEmailInterceptor) // Enviar email de bienvenida automáticamente
export class AuthController {
  constructor(
    @Inject('BETTER_AUTH') private readonly auth: BetterAuthInstance,
  ) {}

  // Better Auth maneja todas las rutas de autenticación automáticamente.
  // NestJS 11 corre sobre Express 5 (path-to-regexp v8): el wildcard '*' dejó de
  // ser válido y debe ser nombrado ('*splat'), o ninguna ruta /auth/* matchea (404).
  @Public()
  @All('*splat')
  async handleAuth(@Req() req: ExpressRequest, @Res() res: ExpressResponse) {
    const handler = toNodeHandler(this.auth);
    return handler(req, res);
  }
}
