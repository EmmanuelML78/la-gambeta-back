/**
 * OAuth and Better Auth Type Definitions
 */

export interface OAuthUser {
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
  emailVerified?: boolean;
}

export interface OAuthAccount {
  provider: string;
  providerAccountId: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface BetterAuthUser {
  id: string;
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  emailVerified: boolean;
  image?: string;
  role?: string;
  isActive?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BetterAuthSession {
  id: string;
  userId: string;
  expiresAt: Date;
  token: string;
  ipAddress?: string;
  userAgent?: string;
  user?: BetterAuthUser;
}

export interface EmailContext {
  firstName: string;
  lastName: string;
  resetUrl?: string;
  verificationUrl?: string;
  expiresIn: string;
}

export interface SendEmailData {
  user: BetterAuthUser;
  url: string;
  token: string;
}
