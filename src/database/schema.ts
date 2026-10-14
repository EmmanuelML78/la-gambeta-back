import {
  boolean,
  decimal,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import {
  AuthProvider,
  UserRole,
  CourtType,
  CourtSurface,
  BookingStatus,
  PaymentStatus,
  ContactRequestStatus,
  ContactRequesterType,
} from '../common/enums';
import { OFFICIAL_CURRENCY } from '../common/payment.constants';

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
export const contactRequestStatusEnum = pgEnum('contact_request_status', [
  ContactRequestStatus.NEW,
  ContactRequestStatus.IN_PROGRESS,
  ContactRequestStatus.RESOLVED,
]);
export const contactRequesterTypeEnum = pgEnum('contact_requester_type', [
  ContactRequesterType.PLAYER,
  ContactRequesterType.VENUE_OWNER,
  ContactRequesterType.CONTRACTOR,
  ContactRequesterType.OTHER,
]);
export const PaymentFlow = {
  HOSTED_CHECKOUT: 'hosted_checkout',
  DIRECT_CARD: 'direct_card',
  LEGACY_UNKNOWN: 'legacy_unknown',
} as const;
export type PaymentFlow = (typeof PaymentFlow)[keyof typeof PaymentFlow];
export const paymentFlowEnum = pgEnum('payment_flow', [
  PaymentFlow.HOSTED_CHECKOUT,
  PaymentFlow.DIRECT_CARD,
  PaymentFlow.LEGACY_UNKNOWN,
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

/**
 * Sede física del cliente. Un mismo predio puede tener varias sucursales, y
 * las canchas cuelgan de una.
 *
 * Esto es MULTI-SEDE, no multi-tenant: el despliegue sigue siendo uno por
 * empresa. Cada cliente corre su instancia con su base y sus credenciales de
 * cobro — cobrar en una cuenta única por varios comercios sería actuar como
 * agregador de pagos, que es actividad regulada.
 *
 * `latitude`/`longitude` son decimales, NUNCA float: en punto flotante los
 * grados pierden precisión y el pin se corre de cuadra. 8 decimales dan
 * resolución de ~1mm, de sobra.
 */
export const venues = pgTable('venues', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  address: text('address').notNull(),
  city: text('city'),
  phone: text('phone'),
  latitude: decimal('latitude', { precision: 10, scale: 8 }),
  longitude: decimal('longitude', { precision: 11, scale: 8 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const courts = pgTable('courts', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Nullable a propósito: hay canchas creadas antes de que existieran las
  // sedes. Migrarlas a NOT NULL exige backfill, y romper el arranque de una
  // instancia en producción por eso no vale la pena.
  venueId: uuid('venue_id').references(() => venues.id, {
    onDelete: 'set null',
  }),
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

export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    courtId: uuid('court_id')
      .notNull()
      .references(() => courts.id, { onDelete: 'restrict' }),
    bookingDate: timestamp('booking_date').notNull(),
    startTime: text('start_time').notNull(),
    endTime: text('end_time').notNull(),
    status: bookingStatusEnum('status').notNull().default(BookingStatus.DRAFT),
    totalPrice: decimal('total_price', { precision: 10, scale: 2 }).notNull(),
    notes: text('notes'),
    holdExpiresAt: timestamp('hold_expires_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    // Availability es el hot path: filtra por cancha + fecha.
    index('bookings_court_date_idx').on(table.courtId, table.bookingDate),
    index('bookings_user_idx').on(table.userId),
    index('bookings_status_idx').on(table.status),
  ],
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    mpPaymentId: text('mp_payment_id').unique(),
    mpPreferenceId: text('mp_preference_id'),
    provider: text('provider'),
    providerCheckoutId: text('provider_checkout_id'),
    providerPaymentId: text('provider_payment_id'),
    idempotencyKey: text('idempotency_key'),
    checkoutUrl: text('checkout_url'),
    checkoutExpiresAt: timestamp('checkout_expires_at'),
    paymentFlow: paymentFlowEnum('payment_flow')
      .notNull()
      .default(PaymentFlow.LEGACY_UNKNOWN),
    manualReview: boolean('manual_review').notNull().default(false),
    manualReviewReason: text('manual_review_reason'),
    manualReviewAt: timestamp('manual_review_at'),
    amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
    currency: text('currency').notNull().default(OFFICIAL_CURRENCY),
    status: paymentStatusEnum('status')
      .notNull()
      .default(PaymentStatus.PENDING),
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
  },
  (table) => [
    index('payments_booking_idx').on(table.bookingId),
    index('payments_flow_status_idx').on(
      table.paymentFlow,
      table.status,
      table.createdAt.desc(),
    ),
    index('payments_manual_review_idx').on(
      table.manualReview,
      table.manualReviewAt.desc(),
      table.id.desc(),
    ),
    uniqueIndex('payments_booking_idempotency_unique').on(
      table.bookingId,
      table.idempotencyKey,
    ),
    uniqueIndex('payments_provider_checkout_unique')
      .on(table.provider, table.providerCheckoutId)
      .where(sql`${table.providerCheckoutId} is not null`),
    uniqueIndex('payments_provider_payment_unique')
      .on(table.provider, table.providerPaymentId)
      .where(sql`${table.providerPaymentId} is not null`),
    index('payments_booking_created_id_idx').on(
      table.bookingId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    uniqueIndex('payments_open_attempt_unique')
      .on(table.bookingId)
      .where(
        sql.raw(
          `"payments"."status" in ('${PaymentStatus.PENDING}', '${PaymentStatus.PROCESSING}')`,
        ),
      ),
  ],
);

export const bookingStatusHistory = pgTable(
  'booking_status_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    fromStatus: bookingStatusEnum('from_status'),
    toStatus: bookingStatusEnum('to_status').notNull(),
    actorType: text('actor_type').notNull(),
    actorId: text('actor_id'),
    source: text('source').notNull(),
    reason: text('reason'),
    correlationId: text('correlation_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('booking_status_history_booking_created_idx').on(
      table.bookingId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index('booking_status_history_correlation_idx').on(table.correlationId),
  ],
);

export const paymentEvents = pgTable(
  'payment_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'restrict' }),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    provider: text('provider').notNull(),
    providerEventId: text('provider_event_id').notNull(),
    fromStatus: paymentStatusEnum('from_status'),
    toStatus: paymentStatusEnum('to_status').notNull(),
    actorType: text('actor_type').notNull(),
    actorId: text('actor_id'),
    source: text('source').notNull(),
    reason: text('reason'),
    correlationId: text('correlation_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('payment_events_provider_event_unique').on(
      table.provider,
      table.providerEventId,
    ),
    index('payment_events_payment_created_idx').on(
      table.paymentId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index('payment_events_booking_created_idx').on(
      table.bookingId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index('payment_events_correlation_idx').on(table.correlationId),
  ],
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorType: text('actor_type').notNull(),
    actorId: text('actor_id'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    source: text('source').notNull(),
    reason: text('reason'),
    correlationId: text('correlation_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('audit_events_entity_created_idx').on(
      table.entityType,
      table.entityId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index('audit_events_actor_created_idx').on(
      table.actorType,
      table.actorId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index('audit_events_correlation_idx').on(table.correlationId),
  ],
);

/**
 * Commercial and support enquiries submitted from the public landing page.
 * Only fields needed to follow up are stored; consent is represented by the
 * acceptance timestamp instead of retaining extra privacy metadata.
 */
export const contactRequests = pgTable(
  'contact_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requesterType: contactRequesterTypeEnum('requester_type').notNull(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    organization: text('organization'),
    message: text('message').notNull(),
    status: contactRequestStatusEnum('status')
      .notNull()
      .default(ContactRequestStatus.NEW),
    privacyAcceptedAt: timestamp('privacy_accepted_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('contact_requests_status_created_idx').on(
      table.status,
      table.createdAt,
    ),
    index('contact_requests_requester_type_idx').on(table.requesterType),
  ],
);

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

export const venuesRelations = relations(venues, ({ many }) => ({
  courts: many(courts),
}));

export const courtsRelations = relations(courts, ({ one, many }) => ({
  venue: one(venues, {
    fields: [courts.venueId],
    references: [venues.id],
  }),
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
  statusHistory: many(bookingStatusHistory),
  paymentEvents: many(paymentEvents),
}));

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  booking: one(bookings, {
    fields: [payments.bookingId],
    references: [bookings.id],
  }),
  events: many(paymentEvents),
}));

export const bookingStatusHistoryRelations = relations(
  bookingStatusHistory,
  ({ one }) => ({
    booking: one(bookings, {
      fields: [bookingStatusHistory.bookingId],
      references: [bookings.id],
    }),
  }),
);

export const paymentEventsRelations = relations(paymentEvents, ({ one }) => ({
  payment: one(payments, {
    fields: [paymentEvents.paymentId],
    references: [payments.id],
  }),
  booking: one(bookings, {
    fields: [paymentEvents.bookingId],
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

export type Venue = typeof venues.$inferSelect;
export type NewVenue = typeof venues.$inferInsert;

export type Court = typeof courts.$inferSelect;
export type NewCourt = typeof courts.$inferInsert;

export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;

export type ContactRequest = typeof contactRequests.$inferSelect;
export type NewContactRequest = typeof contactRequests.$inferInsert;

export type BookingStatusHistory = typeof bookingStatusHistory.$inferSelect;
export type NewBookingStatusHistory = typeof bookingStatusHistory.$inferInsert;

export type PaymentEventRecord = typeof paymentEvents.$inferSelect;
export type NewPaymentEventRecord = typeof paymentEvents.$inferInsert;

export type AuditEvent = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;
