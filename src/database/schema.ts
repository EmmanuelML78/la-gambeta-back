import {
  boolean,
  decimal,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import {
  AuthProvider,
  UserRole,
  CourtType,
  CourtSurface,
  BookingStatus,
  PaymentStatus,
} from '../common/enums';

export const userRoleEnum = pgEnum('user_role', [
  UserRole.ADMIN,
  UserRole.USER,
]);
export const authProviderEnum = pgEnum('auth_provider', [
  AuthProvider.LOCAL,
  AuthProvider.GOOGLE,
]);
export const courtTypeEnum = pgEnum('court_type', [
  CourtType.FUTBOL_5,
  CourtType.FUTBOL_7,
  CourtType.FUTBOL_11,
  CourtType.TENIS,
  CourtType.PADEL,
  CourtType.BASQUET,
  CourtType.VOLEY,
]);
export const courtSurfaceEnum = pgEnum('court_surface', [
  CourtSurface.CESPED_NATURAL,
  CourtSurface.CESPED_SINTETICO,
  CourtSurface.CEMENTO,
  CourtSurface.ARCILLA,
  CourtSurface.PARQUET,
  CourtSurface.ARENA,
]);
export const bookingStatusEnum = pgEnum('booking_status', [
  BookingStatus.DRAFT,
  BookingStatus.CONFIRMED,
  BookingStatus.ACTIVE,
  BookingStatus.FINISHED,
  BookingStatus.NO_SHOW,
  BookingStatus.PENDING,
  BookingStatus.PROCESSING,
  BookingStatus.COMPLETED,
  BookingStatus.FAILED,
  BookingStatus.CANCELLED,
]);
export const paymentStatusEnum = pgEnum('payment_status', [
  PaymentStatus.SUCCEEDED,
  PaymentStatus.REFUNDED,
  PaymentStatus.PARTIALLY_REFUNDED,
  PaymentStatus.PENDING,
  PaymentStatus.PROCESSING,
  PaymentStatus.COMPLETED,
  PaymentStatus.FAILED,
  PaymentStatus.CANCELLED,
]);

// Better Auth compatible users table
export const users = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name'), // Optional - se genera como firstName + lastName
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  // Custom fields
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  role: userRoleEnum('role').notNull().default(UserRole.USER),
  isActive: boolean('is_active').notNull().default(true),
});

// Better Auth sessions table
export const sessions = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
});

// Better Auth accounts table (for OAuth)
export const accounts = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Better Auth verification tokens table
export const verificationTokens = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const courts = pgTable('courts', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  imageUrl: text('image_url'),
  pricePerHour: decimal('price_per_hour', {
    precision: 10,
    scale: 2,
  }).notNull(),
  type: courtTypeEnum('type').notNull(),
  surface: courtSurfaceEnum('surface').notNull(),
  minPlayers: integer('min_players').notNull().default(2),
  maxPlayers: integer('max_players').notNull(),
  openingTime: text('opening_time').notNull().default('06:00'),
  closingTime: text('closing_time').notNull().default('23:00'),
  availableDays: text('available_days').notNull().default('1,2,3,4,5,6,7'), // 1=Monday, 7=Sunday
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  courtId: uuid('court_id')
    .notNull()
    .references(() => courts.id, { onDelete: 'cascade' }),
  bookingDate: timestamp('booking_date').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  status: bookingStatusEnum('status').notNull().default(BookingStatus.DRAFT),
  totalPrice: decimal('total_price', { precision: 10, scale: 2 }).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  // Availability es el hot path: filtra por cancha + fecha.
  index('bookings_court_date_idx').on(table.courtId, table.bookingDate),
  index('bookings_user_idx').on(table.userId),
  index('bookings_status_idx').on(table.status),
]);

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  bookingId: uuid('booking_id')
    .notNull()
    .references(() => bookings.id, { onDelete: 'cascade' }),
  mpPaymentId: text('mp_payment_id').unique(),
  mpPreferenceId: text('mp_preference_id'),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('ARS'),
  status: paymentStatusEnum('status').notNull().default(PaymentStatus.PENDING),
  paymentMethod: text('payment_method'),
  paymentType: text('payment_type'),
  installments: integer('installments').default(1),
  description: text('description'),
  metadata: text('metadata'),
  failureReason: text('failure_reason'),
  externalReference: text('external_reference'),
  dateApproved: timestamp('date_approved'),
  refundedAmount: decimal('refunded_amount', { precision: 10, scale: 2 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  // getPaymentByBookingId + persistencia del webhook filtran por booking_id.
  index('payments_booking_idx').on(table.bookingId),
]);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  bookings: many(bookings),
  sessions: many(sessions),
  accounts: many(accounts),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));

export const courtsRelations = relations(courts, ({ many }) => ({
  bookings: many(bookings),
}));

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  user: one(users, {
    fields: [bookings.userId],
    references: [users.id],
  }),
  court: one(courts, {
    fields: [bookings.courtId],
    references: [courts.id],
  }),
  payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  booking: one(bookings, {
    fields: [payments.bookingId],
    references: [bookings.id],
  }),
}));

// Types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

export type VerificationToken = typeof verificationTokens.$inferSelect;
export type NewVerificationToken = typeof verificationTokens.$inferInsert;

export type Court = typeof courts.$inferSelect;
export type NewCourt = typeof courts.$inferInsert;

export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
