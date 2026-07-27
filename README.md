# 🎾 El Predio - Backend API

Sistema completo de autenticación y manejo de roles para la plataforma de reserva de canchas **El Predio**.

## 🚀 Características

### ✅ **Sistema de Autenticación Completo**
- **Registro local** con validación de email
- **Login con Google OAuth**
- **Verificación de email** con plantillas profesionales
- **Recuperación de contraseña**
- **JWT tokens** (access + refresh)
- **Rate limiting** para seguridad

### 🔐 **Control de Roles**
- **Roles**: Admin y User
- **Guards personalizados** para protección de rutas
- **Decoradores** para fácil manejo de permisos

### 📧 **Sistema de Emails**
- **Plantillas HTML profesionales** branded para El Predio
- **Nodemailer + Handlebars**
- Templates para: verificación, bienvenida, reset password, confirmación reservas

### 🗄️ **Base de Datos**
- **PostgreSQL** con Docker
- **Drizzle ORM** para type-safe queries
- **Migraciones automáticas**

### 📚 **Documentación**
- **Swagger/OpenAPI** integrado
- **Endpoints documentados**
- **Schemas de validación**

## 🛠️ Stack Tecnológico

- **Framework**: NestJS 11
- **Database**: PostgreSQL 17.4
- **ORM**: Drizzle ORM
- **Authentication**: Passport (JWT, Google OAuth, Local)
- **Email**: Nodemailer + Handlebars
- **Validation**: class-validator + class-transformer
- **Documentation**: Swagger/OpenAPI
- **Security**: Helmet, CORS, Rate Limiting

## ⚙️ Configuración e Instalación

### 1. **Clonar e Instalar**
```bash
git clone <repository-url>
cd back
pnpm install
```

### 2. **Configurar Variables de Entorno**
```bash
cp .env.example .env
```

Edita el archivo `.env` con tus credenciales:
```env
# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=your_password
DATABASE_NAME=el_predio_db

# JWT
JWT_SECRET=your_super_secret_jwt_key
JWT_REFRESH_SECRET=your_super_secret_refresh_key

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Email (Gmail example)
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=noreply@elpredio.com
MAIL_PASSWORD=your_app_password
```

### 3. **Levantar Base de Datos**
```bash
docker-compose up -d
```

### 4. **Ejecutar Migraciones**
```bash
pnpm run db:push
```

### 5. **Ejecutar la Aplicación**
```bash
# Desarrollo
pnpm run start:dev

# Producción
pnpm run build
pnpm run start:prod
```

## 📖 Uso

### **Endpoints Principales**

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/api/v1/auth/register` | Registro de usuario |
| `POST` | `/api/v1/auth/login` | Login local |
| `POST` | `/api/v1/auth/verify-email` | Verificar email |
| `POST` | `/api/v1/auth/forgot-password` | Solicitar reset |
| `POST` | `/api/v1/auth/reset-password` | Reset password |
| `GET` | `/api/v1/auth/google` | Login con Google |
| `GET` | `/api/v1/auth/profile` | Perfil usuario |
| `POST` | `/api/v1/auth/refresh` | Refresh token |

### **Documentación Interactiva**
Visita `http://localhost:3001/api/docs` para la documentación Swagger completa.

### **Flujo de Registro**
1. Usuario se registra en `/auth/register`
2. Recibe email de verificación con plantilla de El Predio
3. Hace click en el enlace para verificar
4. Recibe email de bienvenida
5. Puede hacer login en `/auth/login`

### **Uso de Decoradores**
```typescript
// Ruta pública
@Public()
@Get('public')

// Solo administradores
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Get('admin-only')

// Usuario actual
@Get('profile')
getProfile(@CurrentUser() user: any) {
  return user;
}
```

## 🧪 Scripts Disponibles

```bash
# Desarrollo
pnpm run start:dev        # Servidor con watch mode

# Base de datos
pnpm run db:generate      # Generar migración
pnpm run db:push          # Aplicar cambios a DB
pnpm run db:studio        # Drizzle Studio

# Testing
pnpm run test             # Tests unitarios
pnpm run test:e2e         # Tests E2E
pnpm run test:cov         # Coverage

# Linting
pnpm run lint             # ESLint
pnpm run format           # Prettier
```

## 🔧 Configuración de Google OAuth

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un nuevo proyecto o selecciona uno existente
3. Habilita la API de Google+
4. Ve a "Credenciales" > "Crear credenciales" > "ID de cliente OAuth 2.0"
5. Configura:
   - **Authorized JavaScript origins**: `http://localhost:3001`
   - **Authorized redirect URIs**: `http://localhost:3001/api/v1/auth/google/callback`

## 📧 Configuración de Email

### Gmail
1. Habilita 2FA en tu cuenta Gmail
2. Genera una "Contraseña de aplicación"
3. Usa esa contraseña en `MAIL_PASSWORD`

### Otros proveedores
Configura `MAIL_HOST`, `MAIL_PORT` según tu proveedor (SendGrid, AWS SES, etc.)

## 🚀 Características de Producción

- ✅ **Helmet** para headers de seguridad
- ✅ **CORS** configurado
- ✅ **Rate limiting** anti-spam
- ✅ **Validation pipes** globales  
- ✅ **Error handling** personalizado
- ✅ **Logging** estructurado
- ✅ **Environment validation**

## 📁 Estructura del Proyecto

```
src/
├── auth/              # Módulo de autenticación
│   ├── decorators/    # Decoradores (@Roles, @Public, etc.)
│   ├── dto/          # DTOs de request/response
│   ├── guards/       # Guards de seguridad
│   ├── strategies/   # Strategies de Passport
│   └── interfaces/   # Interfaces TypeScript
├── users/            # Módulo de usuarios
├── mail/             # Módulo de emails
│   └── templates/    # Plantillas HTML
├── database/         # Configuración DB y schema
├── common/           # Enums y utilidades
└── main.ts          # Bootstrap de la aplicación
```

## 🎨 Plantillas de Email

Las plantillas incluyen:
- ✨ **Diseño responsive**
- 🎾 **Branding de El Predio**
- 🎨 **Colores corporativos**
- 📱 **Compatible con todos los clientes de email**

## ⚡ Próximas Funcionalidades

- [ ] Sistema de reservas de canchas
- [ ] Notificaciones push
- [ ] Dashboard administrativo
- [ ] Integración con pagos
- [ ] Chat en tiempo real
- [ ] Sistema de puntos/fidelización

## 🤝 Contribución

1. Fork del repositorio
2. Crear branch: `git checkout -b feature/nueva-funcionalidad`
3. Commit: `git commit -m 'Add nueva funcionalidad'`
4. Push: `git push origin feature/nueva-funcionalidad`
5. Crear Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT.

---

## 🎾 ¡Bienvenido a El Predio!

*Tu plataforma de reserva de canchas con autenticación de nivel enterprise.*
