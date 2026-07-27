# Guía de Better Auth en El Predio

## Descripción

Este proyecto utiliza [Better Auth](https://www.better-auth.com/) para manejar toda la autenticación. Better Auth es una solución moderna y completa que maneja:

- ✅ Autenticación con email/password
- ✅ OAuth con Google (y otros proveedores)
- ✅ Gestión de sesiones
- ✅ Verificación de email automática
- ✅ Recuperación de contraseña
- ✅ Manejo automático de tokens
- ✅ Envío automático de emails (verificación, reset de password, bienvenida)

## Configuración

### Variables de Entorno

Asegúrate de tener estas variables en tu archivo `.env`:

```env
# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=your_password
DATABASE_NAME=el_predio_db

# Google OAuth (Better Auth)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3001/api/v1/auth/google/callback

# Email Configuration
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=noreply@elpredio.com
MAIL_PASSWORD=your_email_app_password
MAIL_FROM="El Predio <noreply@elpredio.com>"

# Frontend URLs
FRONTEND_URL=http://localhost:3000

# Security
EMAIL_VERIFICATION_TOKEN_EXPIRY=24h
PASSWORD_RESET_TOKEN_EXPIRY=1h
REQUIRE_EMAIL_VERIFICATION=false
```

## Endpoints de Autenticación

Better Auth expone automáticamente estos endpoints en `/api/v1/auth`:

### Registro con Email/Password
```bash
POST /api/v1/auth/sign-up/email
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "firstName": "Juan",
  "lastName": "Pérez"
}
```

### Login con Email/Password
```bash
POST /api/v1/auth/sign-in/email
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

### Login con Google
```bash
GET /api/v1/auth/sign-in/google
```

### Logout
```bash
POST /api/v1/auth/sign-out
Authorization: Bearer <token>
```

### Obtener Sesión Actual
```bash
GET /api/v1/auth/get-session
Authorization: Bearer <token>
```

### Verificar Email
```bash
POST /api/v1/auth/verify-email
Content-Type: application/json

{
  "token": "verification_token_from_email"
}
```

### Solicitar Recuperación de Contraseña
```bash
POST /api/v1/auth/forgot-password
Content-Type: application/json

{
  "email": "user@example.com"
}
```

### Resetear Contraseña
```bash
POST /api/v1/auth/reset-password
Content-Type: application/json

{
  "token": "reset_token_from_email",
  "password": "NewSecurePassword123!"
}
```

## Proteger Rutas

### Rutas Públicas
Usa el decorador `@Public()` para rutas que no requieren autenticación:

```typescript
import { Public } from './auth/decorators/public.decorator';

@Public()
@Get('health')
getHealth() {
  return { status: 'ok' };
}
```

### Rutas Protegidas
Por defecto, todas las rutas están protegidas por el `BetterAuthGuard`. No necesitas hacer nada especial:

```typescript
@Get('profile')
getProfile(@CurrentUser() user: any) {
  return user;
}
```

### Rutas con Roles
Usa el decorador `@Roles()` para proteger rutas por rol:

```typescript
import { Roles } from './auth/decorators/roles.decorator';
import { UserRole } from './common/enums';

@Roles(UserRole.ADMIN)
@Delete('users/:id')
deleteUser(@Param('id') id: string) {
  // Solo admins pueden acceder
}
```

## Obtener Usuario Actual

Usa el decorador `@CurrentUser()` en tus controladores:

```typescript
import { CurrentUser } from './auth/decorators/current-user.decorator';

@Get('me')
getCurrentUser(@CurrentUser() user: any) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
  };
}

// Obtener solo una propiedad específica
@Get('email')
getEmail(@CurrentUser('email') email: string) {
  return { email };
}
```

## Schema de Base de Datos

Better Auth utiliza estas tablas (ya definidas en `schema.ts`):

- `user` - Usuarios del sistema
- `session` - Sesiones activas
- `account` - Cuentas OAuth vinculadas
- `verification` - Tokens de verificación

## Migraciones

Si haces cambios al schema:

```bash
# Generar migraciones
pnpm db:generate

# Aplicar cambios a la base de datos
pnpm db:push

# Ver la base de datos en Drizzle Studio
pnpm db:studio
```

## Servicios Auxiliares

### AuthService

Proporciona métodos auxiliares específicos del negocio:

```typescript
// Enviar email de bienvenida
await authService.sendWelcomeEmail(userId);

// Actualizar rol de usuario
await authService.updateUserRole(userId, UserRole.ADMIN);

// Desactivar/activar usuario
await authService.deactivateUser(userId);
await authService.activateUser(userId);

// Acceder a la instancia de Better Auth
const betterAuth = authService.getBetterAuth();
```

## Guards

### BetterAuthGuard
Aplicado globalmente. Valida sesiones y verifica:
- Sesión activa y válida
- Usuario activo (no desactivado)
- Email verificado (si `REQUIRE_EMAIL_VERIFICATION=true`)

### RolesGuard
Verifica que el usuario tenga los roles requeridos.

## Frontend Integration

Ejemplo de cliente JavaScript/TypeScript:

```typescript
// Registro
const response = await fetch('http://localhost:3001/api/v1/auth/sign-up/email', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include', // Importante para cookies
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'SecurePassword123!',
    firstName: 'Juan',
    lastName: 'Pérez'
  })
});

// Login
const loginResponse = await fetch('http://localhost:3001/api/v1/auth/sign-in/email', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'SecurePassword123!'
  })
});

const { token } = await loginResponse.json();

// Usar el token en requests posteriores
const profileResponse = await fetch('http://localhost:3001/api/v1/courts', {
  headers: {
    'Authorization': `Bearer ${token}`
  },
  credentials: 'include'
});
```

## Flujo Completo de Emails

### 📧 Sistema de Emails Automatizado

El proyecto envía automáticamente 3 tipos de emails:

#### 1. **Email de Verificación** (Opcional)

**Cuándo se envía:** Inmediatamente después del registro si `REQUIRE_EMAIL_VERIFICATION=true`

**Plantilla:** [email-verification.hbs](src/mail/templates/email-verification.hbs)

**Contenido:**
- Saludo personalizado con nombre y apellido
- Botón de verificación con URL al frontend
- Tiempo de expiración del token
- Nota de seguridad

**Flujo:**
1. Usuario se registra en `/auth/sign-up/email`
2. Better Auth crea el usuario y un token de verificación
3. Llama automáticamente a `sendVerificationEmail()` en [better-auth.config.ts](src/auth/better-auth.config.ts:47)
4. El email contiene un link como: `http://localhost:3000/verify-email?token=abc123`
5. Usuario hace clic y el frontend llama a `/auth/verify-email`
6. El email del usuario se marca como verificado

#### 2. **Email de Recuperación de Contraseña**

**Cuándo se envía:** Cuando el usuario solicita reset de password en `/auth/forgot-password`

**Plantilla:** [password-reset.hbs](src/mail/templates/password-reset.hbs)

**Contenido:**
- Saludo personalizado
- Botón para restablecer contraseña
- Advertencias de seguridad
- Tiempo de expiración del token

**Flujo:**
1. Usuario hace POST a `/auth/forgot-password` con su email
2. Better Auth genera un token de reset
3. Llama automáticamente a `sendResetPassword()` en [better-auth.config.ts](src/auth/better-auth.config.ts:27)
4. El email contiene un link como: `http://localhost:3000/reset-password?token=xyz789`
5. Usuario hace clic y el frontend muestra formulario de nueva contraseña
6. El frontend llama a `/auth/reset-password` con el token y la nueva contraseña

#### 3. **Email de Bienvenida**

**Cuándo se envía:** Después de que el email es verificado (o inmediatamente si no se requiere verificación)

**Plantilla:** [welcome.hbs](src/mail/templates/welcome.hbs)

**Contenido:**
- Celebración de bienvenida
- Listado de funcionalidades disponibles
- Botón para comenzar a usar la plataforma

**Flujo:**
1. Usuario verifica su email en `/auth/verify-email`
   - O se registra sin verificación requerida
2. El [WelcomeEmailInterceptor](src/auth/interceptors/welcome-email.interceptor.ts) detecta el evento
3. Envía automáticamente el email de bienvenida
4. El usuario recibe confirmación de que su cuenta está lista

### 🔧 Configuración de Emails

Las URLs en los emails apuntan al frontend configurado en `FRONTEND_URL`:

```typescript
// better-auth.config.ts
const verificationUrl = `${frontendUrl}/verify-email?token=${token}`;
const resetUrl = `${frontendUrl}/reset-password?token=${token}`;
```

### 📝 Personalización de Plantillas

Las plantillas están en [src/mail/templates/](src/mail/templates/) y usan Handlebars:

Variables disponibles:
- `firstName` - Nombre del usuario
- `lastName` - Apellido del usuario
- `verificationUrl` - URL de verificación (solo email-verification)
- `resetUrl` - URL de reset (solo password-reset)
- `loginUrl` - URL de login (solo welcome)
- `expiresIn` - Tiempo de expiración del token

Ejemplo de uso en la plantilla:
```handlebars
<h1>¡Hola {{firstName}} {{lastName}}!</h1>
<a href="{{verificationUrl}}">Verificar Email</a>
<p>Este enlace expira en {{expiresIn}}</p>
```

## Mejores Prácticas

1. **Sesiones**: Better Auth maneja las sesiones automáticamente. No necesitas crear o validar tokens manualmente.

2. **Emails**: Los emails de verificación y recuperación de contraseña se envían automáticamente usando el `MailService` configurado.

3. **Cookies**: Better Auth usa cookies HTTP-only para mayor seguridad. Asegúrate de configurar CORS correctamente.

4. **Roles**: Los roles se almacenan como campos adicionales en la tabla `user` y se incluyen automáticamente en la sesión.

5. **Testing**: Para testing, puedes usar el decorador `@Public()` o mockear el `BetterAuthGuard`.

6. **Emails de Prueba**: En desarrollo, puedes usar servicios como [Mailtrap](https://mailtrap.io/) o [MailHog](https://github.com/mailhog/MailHog) para capturar emails sin enviarlos realmente.

## Troubleshooting

### Error: "No hay sesión activa"
- Verifica que el token se esté enviando en el header `Authorization: Bearer <token>`
- Verifica que las cookies se estén enviando (`credentials: 'include'`)

### Error: "Cuenta desactivada"
- El usuario tiene `isActive: false`. Usa `authService.activateUser(userId)` para activarlo.

### Error: "Email no verificado"
- Si `REQUIRE_EMAIL_VERIFICATION=true`, el usuario debe verificar su email primero.
- Cambia a `false` en desarrollo si no necesitas verificación.

### Error de CORS
- Asegúrate de que `FRONTEND_URL` esté en las `trustedOrigins` de Better Auth
- Verifica la configuración de CORS en `main.ts`

## Recursos

- [Documentación de Better Auth](https://www.better-auth.com/)
- [Better Auth GitHub](https://github.com/better-auth/better-auth)
- [Drizzle ORM](https://orm.drizzle.team/)
