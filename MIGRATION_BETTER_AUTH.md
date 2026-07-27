# Migración a Better Auth

Este documento describe la migración del sistema de autenticación de Passport.js a Better Auth.

## Cambios Principales

### 1. Dependencias

**Removidas:**
- `@nestjs/jwt`
- `@nestjs/passport`
- `passport`
- `passport-jwt`
- `passport-local`
- `passport-google-oauth20`
- `bcryptjs`

**Añadidas:**
- `better-auth@^1.3.26`

### 2. Schema de Base de Datos

El schema de usuarios ha cambiado significativamente para ser compatible con Better Auth:

**Tabla `users` (antes `users`):**
- Renombrada a `user`
- `id`: Ahora usa `text` en lugar de `uuid`
- `name`: Nuevo campo que combina `firstName` y `lastName`
- `emailVerified`: Reemplaza `isEmailVerified` (boolean en lugar de timestamp)
- `image`: Nuevo campo opcional para avatar
- Removidos: `password`, `provider`, `googleId`, `emailVerificationToken`, `emailVerificationExpires`, `passwordResetToken`, `passwordResetExpires`, `refreshToken`

**Nuevas Tablas:**
- `session`: Maneja sesiones de usuario
- `account`: Maneja cuentas OAuth y credenciales
- `verification`: Maneja tokens de verificación

### 3. Migración de Datos

Para migrar datos existentes, ejecuta los siguientes pasos:

```bash
# 1. Generar la migración de Drizzle
pnpm db:generate

# 2. Ejecutar la migración
pnpm db:migrate
```

**IMPORTANTE:** Antes de ejecutar la migración, asegúrate de hacer un backup de tu base de datos.

### 4. Estructura de Código

#### AuthModule
- Ahora usa `createBetterAuth` para inicializar Better Auth
- Exporta `BETTER_AUTH` como provider inyectable
- `BetterAuthGuard` reemplaza `JwtAuthGuard` globalmente

#### AuthService
- Simplificado significativamente
- La mayoría de la lógica de autenticación es manejada por Better Auth
- Solo contiene métodos auxiliares para envío de emails y consultas personalizadas

#### AuthController
- Endpoints principales delegados a Better Auth handler
- Endpoints personalizados (register, login) usan la API de Better Auth
- Google OAuth manejado automáticamente por Better Auth

#### Guards
- `BetterAuthGuard`: Nuevo guard principal que valida sesiones de Better Auth
- `RolesGuard`: Compatible sin cambios
- Removidos: `JwtAuthGuard`, `LocalAuthGuard`, `GoogleAuthGuard`

#### Strategies
- Todas las strategies de Passport removidas
- Better Auth maneja la validación internamente

### 5. Variables de Entorno

Actualiza tu `.env`:

```env
# Removidas (ya no necesarias):
# JWT_SECRET
# JWT_REFRESH_SECRET
# JWT_ACCESS_TOKEN_EXPIRY
# JWT_REFRESH_TOKEN_EXPIRY
# BCRYPT_SALT_ROUNDS

# Mantener:
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
EMAIL_VERIFICATION_URL=http://localhost:3000/verify-email
PASSWORD_RESET_URL=http://localhost:3000/reset-password
FRONTEND_URL=http://localhost:3000

# Nuevas (opcionales):
# Better Auth genera sus propios secrets si no se proporcionan
```

### 6. Endpoints de API

Los endpoints de autenticación han cambiado:

**Antes (Passport):**
```
POST /auth/register
POST /auth/login
POST /auth/verify-email
POST /auth/resend-verification
POST /auth/forgot-password
POST /auth/reset-password
POST /auth/refresh
POST /auth/logout
GET  /auth/profile
GET  /auth/google
GET  /auth/google/callback
```

**Ahora (Better Auth):**
```
POST /auth/register       # Custom endpoint
POST /auth/login          # Custom endpoint
POST /auth/logout
GET  /auth/session
GET  /auth/google
GET  /auth/google/callback

# Better Auth también proporciona endpoints automáticos:
POST /auth/sign-up/email
POST /auth/sign-in/email
POST /auth/sign-out
GET  /auth/session
POST /auth/forgot-password
POST /auth/reset-password
# Y muchos más...
```

### 7. Uso en Controllers

**Antes:**
```typescript
@UseGuards(JwtAuthGuard)
@Get('protected')
async getProtected(@CurrentUser() user: any) {
  return user;
}
```

**Ahora:**
```typescript
@Get('protected')  // BetterAuthGuard es global
async getProtected(@CurrentUser() user: any) {
  return user;
}

// Para endpoints públicos:
@Public()
@Get('public')
async getPublic() {
  return 'public data';
}
```

### 8. Testing

Los tests necesitan ser actualizados para usar Better Auth:

```typescript
// Antes:
const token = jwtService.sign({ sub: userId });

// Ahora:
const session = await betterAuth.api.signInEmail({
  body: { email: 'test@example.com', password: 'password' }
});
const token = session.token;
```

### 9. Archivos Movidos a .old

Los siguientes archivos fueron respaldados en `src/auth/.old/`:
- `strategies/` - Todas las strategies de Passport
- `guards/jwt-auth.guard.ts`
- `guards/local-auth.guard.ts`
- `guards/google-auth.guard.ts`
- `auth.service.old.ts`
- `auth.controller.old.ts`
- `auth.module.old.ts`

Y en `src/users/`:
- `users.service.old.ts`

Estos archivos se pueden eliminar después de confirmar que la migración funciona correctamente.

### 10. Próximos Pasos

1. **Generar y ejecutar migraciones de base de datos**
   ```bash
   pnpm db:generate
   pnpm db:migrate
   ```

2. **Actualizar código del frontend** para usar los nuevos endpoints de Better Auth

3. **Probar funcionalidad:**
   - Registro de usuarios
   - Login con email/password
   - Login con Google OAuth
   - Verificación de email
   - Reset de contraseña
   - Sesiones y logout

4. **Eliminar archivos .old** una vez confirmada la migración

## Beneficios de Better Auth

- ✅ **Menos código**: Better Auth maneja automáticamente tokens, sesiones, verificación de email, etc.
- ✅ **Más seguro**: Implementación battle-tested de autenticación
- ✅ **Escalable**: Diseñado para aplicaciones modernas
- ✅ **TypeScript-first**: Mejor experiencia de desarrollo
- ✅ **Múltiples proveedores OAuth**: Fácil agregar más proveedores sociales
- ✅ **2FA listo**: Soporte built-in para autenticación de dos factores
- ✅ **Rate limiting**: Protección contra ataques incorporada

## Soporte

Si encuentras problemas durante la migración, revisa:
- [Documentación de Better Auth](https://better-auth.com)
- [Ejemplos de Better Auth con NestJS](https://github.com/better-auth/better-auth/tree/main/examples)
