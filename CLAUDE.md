# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the backend service for "El PREDIO V2", a NestJS TypeScript application with **complete authentication system**, **role-based access control**, **email verification**, and **Google OAuth integration**. It's a production-ready court reservation system backend.

## Development Commands

### Setup
- `pnpm install` - Install dependencies
- `cp .env.example .env` - Copy environment variables template

### Development
- `pnpm run start:dev` - Start development server with watch mode (port 3001)
- `pnpm run start:debug` - Start with debug mode and watch
- `pnpm run start` - Start production server
- `pnpm run start:prod` - Start optimized production build

### Database
- `docker-compose up -d` - Start PostgreSQL database
- `pnpm run db:generate` - Generate database migration
- `pnpm run db:push` - Push schema changes to database
- `pnpm run db:migrate` - Run database migrations
- `pnpm run db:studio` - Open Drizzle Studio (database GUI)

### Code Quality
- `pnpm run lint` - Run ESLint with auto-fix
- `pnpm run format` - Format code with Prettier
- `pnpm run build` - Build the application

### Testing
- `pnpm run test` - Run unit tests
- `pnpm run test:watch` - Run tests in watch mode
- `pnpm run test:cov` - Run tests with coverage
- `pnpm run test:e2e` - Run end-to-end tests
- `pnpm run test:debug` - Run tests in debug mode

## Architecture

### Project Structure
```
src/
├── auth/                   # Authentication module
│   ├── decorators/        # Custom decorators (@Roles, @Public, @CurrentUser)
│   ├── dto/              # Request/Response DTOs
│   ├── guards/           # JWT, Local, Google, Roles guards
│   ├── strategies/       # Passport strategies
│   ├── interfaces/       # TypeScript interfaces
│   ├── auth.controller.ts # Authentication endpoints
│   ├── auth.service.ts   # Authentication business logic
│   └── auth.module.ts    # Authentication module
├── users/                 # User management
│   ├── users.service.ts  # User CRUD operations
│   └── users.module.ts   # Users module
├── mail/                  # Email system
│   ├── templates/        # HTML email templates (Handlebars)
│   ├── mail.service.ts   # Email sending logic
│   └── mail.module.ts    # Mail module
├── database/              # Database configuration
│   ├── migrations/       # Drizzle migrations
│   ├── schema.ts         # Database schema (Users table)
│   └── database.module.ts # Database connection
├── common/
│   └── enums/           # UserRole, AuthProvider enums
└── main.ts              # Application bootstrap with Swagger, security
```

### Technology Stack
- **Framework**: NestJS 11.x
- **Language**: TypeScript (ES2023 target)
- **Database**: PostgreSQL 17.4 + Drizzle ORM
- **Authentication**: Passport (JWT, Google OAuth, Local)
- **Email**: Nodemailer + Handlebars templates
- **Documentation**: Swagger/OpenAPI
- **Security**: Helmet, CORS, Rate limiting
- **Testing**: Jest
- **Validation**: class-validator + class-transformer

## Authentication System

### Key Features
- **Local Registration**: Email/password with email verification
- **Google OAuth**: Seamless social login
- **JWT Tokens**: Access (15min) + Refresh (7 days)
- **Role-based Access**: Admin/User roles
- **Email Templates**: Professional branded templates for El Predio
- **Password Reset**: Secure token-based system
- **Rate Limiting**: Protection against brute force attacks

### API Endpoints (Base: `/api/v1/auth`)
- `POST /register` - Register new user
- `POST /login` - Local login
- `POST /verify-email` - Verify email with token
- `POST /resend-verification` - Resend verification email
- `POST /forgot-password` - Request password reset
- `POST /reset-password` - Reset password with token
- `GET /google` - Initiate Google OAuth
- `GET /google/callback` - Google OAuth callback
- `GET /profile` - Get current user profile
- `POST /refresh` - Refresh access token
- `POST /logout` - Logout user

### Guards and Decorators
- `@Public()` - Make endpoint public (bypass JWT)
- `@Roles(UserRole.ADMIN)` - Require specific role
- `@CurrentUser()` - Inject current user into controller
- `JwtAuthGuard` - Protect routes with JWT
- `RolesGuard` - Role-based access control
- `GoogleAuthGuard` - Handle Google OAuth

## Database Schema

### Users Table
```sql
- id (UUID, primary key)
- email (unique, indexed)
- password (nullable for OAuth users)
- firstName, lastName
- role (ADMIN | USER)
- provider (LOCAL | GOOGLE)
- googleId (nullable)
- isEmailVerified (boolean)
- isActive (boolean)
- emailVerificationToken, emailVerificationExpires
- passwordResetToken, passwordResetExpires
- refreshToken
- createdAt, updatedAt
```

## Environment Variables Required

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
JWT_ACCESS_TOKEN_EXPIRY=15m
JWT_REFRESH_TOKEN_EXPIRY=7d

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3001/api/v1/auth/google/callback

# Email
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=noreply@elpredio.com
MAIL_PASSWORD=your_app_password
MAIL_FROM="El Predio <noreply@elpredio.com>"

# Frontend URLs
FRONTEND_URL=http://localhost:3000
EMAIL_VERIFICATION_URL=${FRONTEND_URL}/verify-email
PASSWORD_RESET_URL=${FRONTEND_URL}/reset-password

# Security
BCRYPT_SALT_ROUNDS=12
PORT=3001
NODE_ENV=development
```

## Development Workflow

1. **Setup**: `docker-compose up -d` (start PostgreSQL)
2. **Environment**: Configure `.env` file
3. **Database**: `pnpm run db:push` (apply schema)
4. **Development**: `pnpm run start:dev`
5. **Documentation**: Visit `http://localhost:3001/api/docs` (Swagger)
6. **Testing**: Use Swagger UI or Postman for API testing

## Code Style & Patterns
- Single quotes for strings
- Trailing commas enabled
- DTOs for all request/response validation
- Service layer pattern for business logic
- Global JWT guard with `@Public()` decorator for exceptions
- Type-safe database operations with Drizzle ORM
- Professional email templates with responsive design
- Comprehensive error handling with custom exceptions

## Security Features
- Helmet for security headers
- CORS configured for frontend integration
- Rate limiting on auth endpoints
- Password hashing with bcrypt (12 rounds)
- JWT tokens with secure secrets
- Input validation on all endpoints
- Email verification required for local accounts

## Key Files
- `drizzle.config.ts` - Drizzle ORM configuration
- `.env.example` - Environment variables template
- `src/database/schema.ts` - Database schema definition
- `src/auth/auth.service.ts` - Core authentication logic
- `src/mail/templates/` - Professional email templates
- `src/main.ts` - App bootstrap with Swagger and security setup