import { BadRequestException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BookingStatus, PaymentStatus, UserRole } from '../common/enums';
import { OFFICIAL_CURRENCY } from '../common/payment.constants';
import { DrizzleService } from '../database/drizzle.service';
import { bookings, payments, Payment, PaymentFlow } from '../database/schema';
import { PaymentsService } from './payments.service';
import { CreatePreferenceDto } from './dto';
import { PaymentEvent, PaymentProvider } from './providers/payment-provider.interface';

const BOOKING_ID = '123e4567-e89b-12d3-a456-426614174000';
const ATTEMPT_ID = '223e4567-e89b-12d3-a456-426614174000';
const KEY = 'card-key-0001';

function makeAttempt(overrides: Partial<Payment> = {}): Payment {
  return {
    id: ATTEMPT_ID,
    bookingId: BOOKING_ID,
    provider: 'mercadopago',
    providerCheckoutId: null,
    providerPaymentId: null,
    idempotencyKey: KEY,
    checkoutUrl: null,
    checkoutExpiresAt: null,
    paymentFlow: PaymentFlow.DIRECT_CARD,
    manualReview: false,
    manualReviewReason: null,
    manualReviewAt: null,
    mpPaymentId: null,
    mpPreferenceId: null,
    amount: '90000.00',
    currency: OFFICIAL_CURRENCY,
    status: PaymentStatus.PENDING,
    paymentMethod: null,
    paymentType: null,
    installments: 1,
    description: null,
    metadata: null,
    failureReason: null,
    externalReference: BOOKING_ID,
    dateApproved: null,
    refundedAmount: null,
    createdAt: new Date('2026-08-30T12:00:00Z'),
    updatedAt: new Date('2026-08-30T12:00:00Z'),
    ...overrides,
  };
}

function createService() {
  const tx = {
    select: jest.fn(),
    update: jest.fn(),
    insert: jest.fn(),
  };
  const db = {
    transaction: jest.fn((callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
    ),
    update: jest.fn(() => ({
      set: jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) })),
    })),
    select: jest.fn(),
  };
  const provider = {
    name: 'mercadopago',
    chargeCard: jest.fn(),
    createCheckout: jest.fn(),
    verifyWebhookSignature: jest.fn().mockReturnValue(true),
    parseWebhookEvent: jest.fn(),
  } as unknown as jest.Mocked<PaymentProvider>;
  return {
    service: new PaymentsService(
      { db } as unknown as DrizzleService,
      new ConfigService(),
      provider,
    ),
    provider,
    db,
    tx,
  };
}

function queryResult<T>(rows: T[]) {
  const query = {
    from: jest.fn(),
    where: jest.fn(),
    orderBy: jest.fn(),
    limit: jest.fn().mockResolvedValue(rows),
    for: jest.fn(),
  };
  query.from.mockReturnValue(query);
  query.where.mockReturnValue(query);
  query.orderBy.mockReturnValue(query);
  query.for.mockResolvedValue(rows);
  return query;
}

function txQuery(rows: any[]) {
  const query: any = {
    from: jest.fn(), where: jest.fn(), orderBy: jest.fn(), limit: jest.fn(), for: jest.fn(),
    then: (resolve: (value: any[]) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
  };
  for (const method of ['from', 'where', 'orderBy', 'limit']) query[method].mockReturnValue(query);
  query.for.mockResolvedValue(rows);
  return query;
}

type ServiceInternals = {
  getBookingOrThrow: jest.Mock;
  resolveOrCreateCardAttempt: jest.Mock;
  markCardAttemptUncertain: jest.Mock;
  findExactPaymentAttempt: jest.Mock;
  persistPaymentEvent: (event: PaymentEvent) => Promise<boolean>;
};

function internals(service: PaymentsService): ServiceInternals {
  return service as unknown as ServiceInternals;
}

function providerEvent(overrides: Partial<PaymentEvent> = {}): PaymentEvent {
  return {
    providerPaymentId: 'mp-payment-1',
    paymentAttemptId: ATTEMPT_ID,
    bookingId: BOOKING_ID,
    status: 'succeeded',
    amount: 90000,
    currency: OFFICIAL_CURRENCY,
    raw: { id: 'mp-payment-1' },
    ...overrides,
  };
}

describe('PaymentsService direct card and webhook attempt integrity', () => {
  it('replays a successful direct-card attempt after the booking is active without charging again', async () => {
    const activeBooking = {
      id: BOOKING_ID,
      userId: 'user-1',
      totalPrice: '90000.00',
      status: BookingStatus.ACTIVE,
    };
    const completedAttempt = makeAttempt({
      status: PaymentStatus.SUCCEEDED,
      providerPaymentId: 'mp-payment-1',
      mpPaymentId: 'mp-payment-1',
    });
    const { service, db, tx, provider } = createService();
    db.select.mockReturnValueOnce(queryResult([activeBooking]));
    tx.select
      .mockReturnValueOnce(txQuery([activeBooking]))
      .mockReturnValueOnce(txQuery([completedAttempt]));

    await expect(
      service.processPayment(
        { bookingId: BOOKING_ID, token: 'token-1' },
        'user-1',
        UserRole.USER,
        KEY,
      ),
    ).resolves.toMatchObject({
      paymentId: 'mp-payment-1',
      paymentAttemptId: ATTEMPT_ID,
      status: PaymentStatus.SUCCEEDED,
    });
    expect(tx.select).toHaveBeenCalledTimes(2);
    expect(provider.chargeCard).not.toHaveBeenCalled();
  });

  it('replays a late successful direct-card attempt on a cancelled booking without reactivating or charging', async () => {
    const cancelledBooking = {
      id: BOOKING_ID,
      userId: 'user-1',
      totalPrice: '90000.00',
      status: BookingStatus.CANCELLED,
    };
    const completedAttempt = makeAttempt({
      status: PaymentStatus.SUCCEEDED,
      providerPaymentId: 'mp-payment-1',
      mpPaymentId: 'mp-payment-1',
      manualReview: true,
    });
    const { service, db, tx, provider } = createService();
    db.select.mockReturnValueOnce(queryResult([cancelledBooking]));
    tx.select
      .mockReturnValueOnce(txQuery([cancelledBooking]))
      .mockReturnValueOnce(txQuery([completedAttempt]));

    await expect(
      service.processPayment(
        { bookingId: BOOKING_ID, token: 'token-1' },
        'user-1',
        UserRole.USER,
        KEY,
      ),
    ).resolves.toMatchObject({ paymentId: 'mp-payment-1', status: PaymentStatus.SUCCEEDED });
    expect(tx.select).toHaveBeenCalledTimes(2);
    expect(provider.chargeCard).not.toHaveBeenCalled();
  });

  it('still rejects a new direct-card key after the booking is active', async () => {
    const activeBooking = {
      id: BOOKING_ID,
      userId: 'user-1',
      totalPrice: '90000.00',
      status: BookingStatus.ACTIVE,
    };
    const { service, db, tx, provider } = createService();
    db.select.mockReturnValueOnce(queryResult([activeBooking]));
    tx.select
      .mockReturnValueOnce(txQuery([activeBooking]))
      .mockReturnValueOnce(txQuery([]));

    await expect(
      service.processPayment(
        { bookingId: BOOKING_ID, token: 'token-2' },
        'user-1',
        UserRole.USER,
        'card-key-0002',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(provider.chargeCard).not.toHaveBeenCalled();
  });

  it('keeps hosted-checkout successful-attempt semantics on an active booking', async () => {
    const activeBooking = {
      id: BOOKING_ID,
      userId: 'user-1',
      totalPrice: '90000.00',
      status: BookingStatus.ACTIVE,
    };
    const completedAttempt = makeAttempt({
      paymentFlow: PaymentFlow.HOSTED_CHECKOUT,
      status: PaymentStatus.SUCCEEDED,
      providerCheckoutId: 'checkout-1',
      checkoutUrl: 'https://checkout.example/1',
    });
    const { service, tx, provider } = createService();
    tx.select
      .mockReturnValueOnce(txQuery([activeBooking]))
      .mockReturnValueOnce(txQuery([completedAttempt]));

    await expect(
      service.createPreference(
        { bookingId: BOOKING_ID } as CreatePreferenceDto,
        'user-1',
        UserRole.USER,
        KEY,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.select).toHaveBeenCalledTimes(2);
    expect(provider.createCheckout).not.toHaveBeenCalled();
  });

  it('creates a direct-card attempt with explicit flow before provider work', async () => {
    const created = makeAttempt({ paymentFlow: PaymentFlow.DIRECT_CARD });
    const values = jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([created]) });
    const { service, tx, provider } = createService();
    tx.select
      .mockReturnValueOnce(txQuery([{ id: BOOKING_ID, userId: 'user-1', totalPrice: '90000.00', status: BookingStatus.PENDING }]))
      .mockReturnValueOnce(txQuery([]))
      .mockReturnValueOnce(txQuery([]))
      .mockReturnValueOnce(txQuery([]));
    tx.insert.mockReturnValue({ values });
    const internal = service as unknown as {
      resolveOrCreateCardAttempt: (booking: { id: string; totalPrice: string }, dto: object, key: string) => Promise<{ attempt: Payment; created: boolean }>;
    };

    await expect(internal.resolveOrCreateCardAttempt(
      { id: BOOKING_ID, totalPrice: '90000.00' }, {}, KEY,
    )).resolves.toEqual({ attempt: created, created: true });
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      paymentFlow: PaymentFlow.DIRECT_CARD,
      currency: OFFICIAL_CURRENCY,
      status: PaymentStatus.PENDING,
    }));
    expect(provider.chargeCard).not.toHaveBeenCalled();
  });

  it('rejects a cross-flow open attempt before a direct-card charge can begin', async () => {
    const hosted = makeAttempt({ paymentFlow: PaymentFlow.HOSTED_CHECKOUT });
    const { service, tx, provider } = createService();
    tx.select
      .mockReturnValueOnce(txQuery([{ id: BOOKING_ID, userId: 'user-1', totalPrice: '90000.00', status: BookingStatus.PENDING }]))
      .mockReturnValueOnce(txQuery([]))
      .mockReturnValueOnce(txQuery([]))
      .mockReturnValueOnce(txQuery([hosted]));
    const internal = service as unknown as {
      resolveOrCreateCardAttempt: (booking: { id: string; totalPrice: string }, dto: object, key: string) => Promise<unknown>;
    };

    await expect(internal.resolveOrCreateCardAttempt(
      { id: BOOKING_ID, totalPrice: '90000.00' }, {}, 'different-card-key',
    )).rejects.toBeInstanceOf(ConflictException);
    expect(provider.chargeCard).not.toHaveBeenCalled();
  });

  it('recovers the unique-open-attempt winner without creating a second card reservation', async () => {
    const winner = makeAttempt();
    const insert = jest.fn(() => ({ values: jest.fn(() => ({ returning: jest.fn().mockRejectedValue({ code: '23505' }) })) }));
    const tx = {
      select: jest.fn()
        .mockReturnValueOnce(txQuery([{ id: BOOKING_ID, userId: 'user-1', totalPrice: '90000.00', status: 'pending' }]))
        .mockReturnValueOnce(txQuery([]))
        .mockReturnValueOnce(txQuery([]))
        .mockReturnValueOnce(txQuery([])),
      insert,
    };
    const db = {
      transaction: jest.fn((callback: (t: typeof tx) => unknown) => callback(tx)),
      select: jest.fn().mockReturnValue(queryResult([winner])),
    };
    const { service, provider } = createService();
    (service as unknown as { drizzleService: { db: unknown } }).drizzleService = {
      db,
    };
    const internal = service as unknown as {
      resolveOrCreateCardAttempt: (
        booking: { id: string; totalPrice: string },
        dto: { installments?: number; description?: string },
        key: string,
      ) => Promise<{ attempt: Payment; created: boolean }>;
    };

    await expect(
      internal.resolveOrCreateCardAttempt(
        { id: BOOKING_ID, totalPrice: '90000.00' },
        {},
        KEY,
      ),
    ).resolves.toEqual({ attempt: winner, created: false });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(provider.chargeCard).not.toHaveBeenCalled();
  });

  it('reserves before charging and refuses a concurrent duplicate while the winner is charging', async () => {
    const { service, provider, tx } = createService();
    const internal = internals(service);
    const attempt = makeAttempt();
    internal.getBookingOrThrow = jest.fn().mockResolvedValue({
      id: BOOKING_ID,
      userId: 'user-1',
      totalPrice: '90000.00',
    });
    internal.resolveOrCreateCardAttempt = jest
      .fn()
      .mockResolvedValueOnce({ attempt, created: true })
      .mockResolvedValueOnce({ attempt, created: false })
      .mockResolvedValueOnce({
        attempt: makeAttempt({
          status: PaymentStatus.SUCCEEDED,
          providerPaymentId: 'mp-payment-1',
          mpPaymentId: 'mp-payment-1',
        }),
        created: false,
      });

    let finishCharge!: (event: PaymentEvent) => void;
    (provider.chargeCard as jest.Mock).mockImplementation(
      () =>
        new Promise<PaymentEvent>((resolve) => {
          finishCharge = resolve;
        }),
    );
    tx.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => ({ for: async () => [{ id: BOOKING_ID }] }) }) }),
    }).mockReturnValueOnce({
      from: () => ({
        where: () => ({ limit: () => ({ for: async () => [attempt] }) }),
      }),
    });
    const updated = makeAttempt({
      status: PaymentStatus.SUCCEEDED,
      providerPaymentId: 'mp-payment-1',
      mpPaymentId: 'mp-payment-1',
    });
    tx.update.mockReturnValue({
      set: () => ({ where: () => ({ returning: async () => [updated] }) }),
    });
    tx.insert.mockReturnValue({ values: jest.fn().mockResolvedValue(undefined) });

    const first = service.processPayment(
      { bookingId: BOOKING_ID, token: 'token-1' },
      'user-1',
      UserRole.USER,
      KEY,
    );
    await Promise.resolve();
    await expect(
      service.processPayment(
        { bookingId: BOOKING_ID, token: 'token-1' },
        'user-1',
        UserRole.USER,
        KEY,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(provider.chargeCard).toHaveBeenCalledTimes(1);
    expect(provider.chargeCard).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentAttemptId: ATTEMPT_ID,
        idempotencyKey: KEY,
        amount: 90000,
        currency: OFFICIAL_CURRENCY,
      }),
    );

    finishCharge(providerEvent());
    await expect(first).resolves.toMatchObject({
      paymentId: 'mp-payment-1',
      paymentAttemptId: ATTEMPT_ID,
      status: PaymentStatus.SUCCEEDED,
    });
    await expect(
      service.processPayment(
        { bookingId: BOOKING_ID, token: 'token-1' },
        'user-1',
        UserRole.USER,
        KEY,
      ),
    ).resolves.toMatchObject({ paymentId: 'mp-payment-1' });
    expect(provider.chargeCard).toHaveBeenCalledTimes(1);
  });

  it('keeps an uncertain provider charge open and blocks same-key and new-key retries', async () => {
    const { service, provider } = createService();
    const internal = internals(service);
    internal.getBookingOrThrow = jest.fn().mockResolvedValue({
      id: BOOKING_ID,
      totalPrice: '90000.00',
    });
    internal.resolveOrCreateCardAttempt = jest
      .fn()
      .mockResolvedValue({ attempt: makeAttempt(), created: true });
    internal.markCardAttemptUncertain = jest.fn().mockResolvedValue(undefined);
    internal.resolveOrCreateCardAttempt
      .mockResolvedValueOnce({ attempt: makeAttempt(), created: true })
      .mockResolvedValue({ attempt: makeAttempt(), created: false });
    (provider.chargeCard as jest.Mock).mockRejectedValue(new Error('provider down'));

    await expect(
      service.processPayment(
        { bookingId: BOOKING_ID, token: 'token-1' },
        'user-1',
        UserRole.USER,
        KEY,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(internal.markCardAttemptUncertain).toHaveBeenCalledWith(
      BOOKING_ID,
      ATTEMPT_ID,
      expect.objectContaining({ message: 'provider down' }),
    );
    await expect(
      service.processPayment(
        { bookingId: BOOKING_ID, token: 'token-1' },
        'user-1',
        UserRole.USER,
        KEY,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.processPayment(
        { bookingId: BOOKING_ID, token: 'token-1' },
        'user-1',
        UserRole.USER,
        'card-key-0002',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(provider.chargeCard).toHaveBeenCalledTimes(1);
  });

  it('rejects and fails the attempt when the provider returns a non-COP currency', async () => {
    const { service, provider } = createService();
    const internal = internals(service);
    internal.getBookingOrThrow = jest.fn().mockResolvedValue({
      id: BOOKING_ID,
      totalPrice: '90000.00',
    });
    internal.resolveOrCreateCardAttempt = jest
      .fn()
      .mockResolvedValue({ attempt: makeAttempt(), created: true });
    internal.markCardAttemptUncertain = jest.fn().mockResolvedValue(undefined);
    (provider.chargeCard as jest.Mock).mockResolvedValue(
      providerEvent({ currency: 'ARS' }),
    );

    await expect(
      service.processPayment(
        { bookingId: BOOKING_ID, token: 'token-1' },
        'user-1',
        UserRole.USER,
        KEY,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(internal.markCardAttemptUncertain).toHaveBeenCalledWith(
      BOOKING_ID,
      ATTEMPT_ID,
      expect.any(BadRequestException),
      'mp-payment-1',
    );
  });

  it('stores an uncertain direct charge as processing for reconciliation', async () => {
    const { service, tx } = createService();
    const internal = internals(service);
    const original = makeAttempt();
    const processing = makeAttempt({
      status: PaymentStatus.PROCESSING,
      failureReason: 'provider timed out',
    });
    tx.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => ({ for: async () => [{ id: BOOKING_ID }] }) }) }),
    }).mockReturnValueOnce({
      from: () => ({
        where: () => ({ limit: () => ({ for: async () => [original] }) }),
      }),
    });
    const set = jest.fn().mockReturnValue({
      where: () => ({ returning: async () => [processing] }),
    });
    tx.update.mockReturnValue({ set });
    const eventValues = jest.fn().mockResolvedValue(undefined);
    tx.insert.mockReturnValue({ values: eventValues });

    await internal.markCardAttemptUncertain(
      BOOKING_ID,
      ATTEMPT_ID,
      new Error('provider timed out'),
    );

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: PaymentStatus.PROCESSING,
        failureReason: 'provider timed out',
      }),
    );
    expect(eventValues).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: ATTEMPT_ID,
        fromStatus: PaymentStatus.PENDING,
        toStatus: PaymentStatus.PROCESSING,
      }),
    );
  });

  it('records late success on a cancelled booking for review without reactivating it', async () => {
    const { service, tx } = createService();
    const internal = service as unknown as {
      findExactPaymentAttempt: jest.Mock;
      persistPaymentEvent: (event: PaymentEvent) => Promise<boolean>;
    };
    const original = makeAttempt();
    internal.findExactPaymentAttempt = jest.fn().mockResolvedValue(original);
    const cancelled = { id: BOOKING_ID, totalPrice: '90000.00', status: BookingStatus.CANCELLED };
    const updated = makeAttempt({ status: PaymentStatus.SUCCEEDED, providerPaymentId: 'mp-payment-1' });
    let selectIndex = 0;
    tx.select.mockImplementation(() => txQuery(selectIndex++ === 0 ? [cancelled] : [original]));
    const updateTables: unknown[] = [];
    const updateValues: unknown[] = [];
    tx.update.mockImplementation((table: unknown) => {
      updateTables.push(table);
      return { set: (value: unknown) => {
        updateValues.push(value);
        return { where: () => ({ returning: async () => table === payments ? [updated] : [] }) };
      } };
    });
    const auditValues: unknown[] = [];
    tx.insert.mockReturnValue({ values: jest.fn((value: unknown) => { auditValues.push(value); return Promise.resolve(undefined); }) });

    await expect(internal.persistPaymentEvent(providerEvent({ providerEventId: 'late-success' }))).resolves.toBe(true);
    expect(updateTables).not.toContain(bookings);
    expect(updateValues).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: PaymentStatus.SUCCEEDED }),
      expect.objectContaining({ manualReview: true, manualReviewAt: expect.any(Date) }),
    ]));
    expect(auditValues).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'late_payment_after_booking_terminal', entityId: ATTEMPT_ID }),
    ]));
  });

  it('does not cancel a booking for an older failure while another attempt remains open', async () => {
    const { service, tx } = createService();
    const internal = service as unknown as {
      cancelBookingIfNoOtherOpenOrSuccessfulAttempt: (tx: unknown, booking: unknown, attemptId: string) => Promise<void>;
    };
    const newer = makeAttempt({ id: '323e4567-e89b-12d3-a456-426614174000', status: PaymentStatus.PROCESSING });
    tx.select.mockReturnValue(txQuery([newer]));

    await internal.cancelBookingIfNoOtherOpenOrSuccessfulAttempt(
      tx,
      { id: BOOKING_ID, status: BookingStatus.PENDING },
      ATTEMPT_ID,
    );
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('appends transition history once per status and targets only the exact attempt on webhook retries', async () => {
    const { service, db, tx } = createService();
    const internal = internals(service);
    const target = makeAttempt();
    const unrelated = makeAttempt({
      id: '323e4567-e89b-12d3-a456-426614174000',
      providerPaymentId: 'other-provider-payment',
      mpPaymentId: 'other-provider-payment',
    });
    let current = target;
    internal.findExactPaymentAttempt = jest.fn().mockResolvedValue(target);
    db.select.mockReturnValue(queryResult([{ totalPrice: '90000.00' }]));
    let selectCall = 0;
    tx.select.mockImplementation(() => {
      const row = selectCall++ % 2 === 0
        ? { id: BOOKING_ID, userId: 'user-1', totalPrice: '90000.00', status: 'pending' }
        : current;
      const query = {
        from: () => query,
        where: () => query,
        limit: () => query,
        for: async () => [row],
      };
      return query;
    });
    const insertedEvents: unknown[] = [];
    const eventIds = new Set<string>();
    tx.insert.mockReturnValue({
      values: jest.fn((value: unknown) => {
        const eventId = (value as { providerEventId: string }).providerEventId;
        if (eventIds.has(eventId)) {
          return Promise.reject({ code: '23505' });
        }
        eventIds.add(eventId);
        insertedEvents.push(value);
        return Promise.resolve(undefined);
      }),
    });
    const paymentUpdates: unknown[] = [];
    tx.update.mockImplementation((table: unknown) => ({
      set: (value: Partial<Payment>) => {
        paymentUpdates.push(value);
        return {
          where: () => ({
            returning: async () => {
              if (table === payments) current = { ...current, ...value };
              return table === payments ? [current] : [];
            },
          }),
        };
      },
    }));

    const processing = providerEvent({
      providerEventId: 'webhook-event-processing',
      status: 'processing',
    });
    expect(await internal.persistPaymentEvent(processing)).toBe(true);
    expect(await internal.persistPaymentEvent(processing)).toBe(false);
    expect(await internal.persistPaymentEvent(
      providerEvent({ providerEventId: 'webhook-event-success', status: 'succeeded' }),
    )).toBe(true);

    expect(internal.findExactPaymentAttempt).toHaveBeenCalledWith(processing);
    expect(
      paymentUpdates.filter((change) => 'providerPaymentId' in (change as object)),
    ).toHaveLength(3);
    expect(tx.update.mock.calls.slice(0, 3).map(([table]) => table)).toEqual([
      payments,
      payments,
      payments,
    ]);
    expect(paymentUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ providerPaymentId: 'mp-payment-1' }),
      ]),
    );
    expect(insertedEvents).toHaveLength(2);
    expect(insertedEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ paymentId: target.id }),
      ]),
    );
    expect(unrelated.status).toBe(PaymentStatus.PENDING);
    expect(current.status).toBe(PaymentStatus.SUCCEEDED);
  });

  it('does not fall back to a booking-wide attempt when exact correlation is absent', async () => {
    const { service, db, tx } = createService();
    const internal = internals(service);
    internal.findExactPaymentAttempt = jest.fn().mockResolvedValue(null);

    await expect(
      internal.persistPaymentEvent(providerEvent({ paymentAttemptId: undefined })),
    ).resolves.toBe(false);
    expect(db.select).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('correlates by exact attempt or provider payment ID, never by booking alone', async () => {
    const { service, db } = createService();
    const target = makeAttempt({
      providerPaymentId: 'mp-payment-1',
      mpPaymentId: 'mp-payment-1',
    });
    db.select = jest.fn().mockReturnValueOnce(queryResult([target]));
    const internal = service as unknown as {
      findExactPaymentAttempt: (event: PaymentEvent) => Promise<Payment | null>;
    };

    await expect(
      internal.findExactPaymentAttempt(providerEvent()),
    ).resolves.toBe(target);
    expect(db.select).toHaveBeenCalledTimes(1);

    db.select = jest
      .fn()
      .mockReturnValueOnce(queryResult([]))
      .mockReturnValueOnce(queryResult([]));
    await expect(
      internal.findExactPaymentAttempt(
        providerEvent({ paymentAttemptId: undefined }),
      ),
    ).resolves.toBeNull();
    expect(db.select).toHaveBeenCalledTimes(2);
  });
});
