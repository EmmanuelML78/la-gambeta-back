import { ConfigService } from '@nestjs/config';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PaymentStatus, UserRole } from '../common/enums';
import { OFFICIAL_CURRENCY } from '../common/payment.constants';
import { DrizzleService } from '../database/drizzle.service';
import { Payment, PaymentFlow } from '../database/schema';
import { PaymentsService } from './payments.service';
import { PaymentProvider } from './providers/payment-provider.interface';

const BOOKING_ID = '123e4567-e89b-12d3-a456-426614174000';
const ATTEMPT_ID = '223e4567-e89b-12d3-a456-426614174000';
const KEY = 'checkout-key-0001';

function attempt(overrides: Partial<Payment> = {}): Payment {
  return {
    id: ATTEMPT_ID,
    bookingId: BOOKING_ID,
    provider: 'polar',
    providerCheckoutId: null,
    providerPaymentId: null,
    idempotencyKey: KEY,
    checkoutUrl: null,
    checkoutExpiresAt: null,
    paymentFlow: PaymentFlow.HOSTED_CHECKOUT,
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

function selectQuery(rows: Payment[]) {
  const query = {
    where: jest.fn(),
    orderBy: jest.fn(),
    limit: jest.fn().mockResolvedValue(rows),
  };
  query.where.mockReturnValue(query);
  query.orderBy.mockReturnValue(query);
  return { from: jest.fn().mockReturnValue(query) };
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

function serviceWith(dbOverrides: Record<string, unknown> = {}) {
  const updateWhere = jest.fn().mockResolvedValue(undefined);
  const updateSet = jest.fn().mockReturnValue({ where: updateWhere });
  const provider = {
    name: 'polar',
    createCheckout: jest.fn().mockResolvedValue({
      providerRef: 'checkout-1',
      initPoint: 'https://checkout.test/1',
    }),
  } as unknown as PaymentProvider;
  const db = {
    update: jest.fn().mockReturnValue({ set: updateSet }),
    transaction: jest.fn((callback: (tx: any) => unknown) => callback({})),
    ...dbOverrides,
  };
  const service = new PaymentsService(
    { db } as unknown as DrizzleService,
    new ConfigService(),
    provider,
  );
  return { service, provider, db, updateSet, updateWhere };
}

type Internals = {
  getBookingOrThrow: jest.Mock;
  resolveOrCreateCheckoutAttempt: jest.Mock;
};

function internals(service: PaymentsService): Internals {
  return service as unknown as Internals;
}

describe('PaymentsService checkout idempotency and currency', () => {
  it('requires a valid idempotency key before creating a checkout attempt', async () => {
    const { service, provider } = serviceWith();
    const internal = internals(service);
    internal.getBookingOrThrow = jest.fn().mockResolvedValue({
      id: BOOKING_ID,
      userId: 'user-1',
      totalPrice: '90000.00',
    });
    internal.resolveOrCreateCheckoutAttempt = jest.fn();

    await expect(
      service.createPreference(
        { bookingId: BOOKING_ID },
        'user-1',
        UserRole.USER,
        undefined,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(internal.resolveOrCreateCheckoutAttempt).not.toHaveBeenCalled();
    expect(provider.createCheckout).not.toHaveBeenCalled();
  });

  it('creates a provider checkout from the persisted attempt using its key and COP', async () => {
    const { service, provider, updateSet } = serviceWith();
    const internal = internals(service);
    internal.getBookingOrThrow = jest.fn().mockResolvedValue({
      id: BOOKING_ID,
      userId: 'user-1',
      totalPrice: '90000.00',
    });
    internal.resolveOrCreateCheckoutAttempt = jest
      .fn()
      .mockResolvedValue(attempt());

    const result = await service.createPreference(
      { bookingId: BOOKING_ID, amount: 1, currency: 'ARS' },
      'user-1',
      UserRole.USER,
      KEY,
    );

    expect(provider.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentAttemptId: ATTEMPT_ID,
        bookingId: BOOKING_ID,
        idempotencyKey: KEY,
        amount: 90000,
        currency: 'COP',
      }),
    );
    expect(updateSet).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        providerCheckoutId: 'checkout-1',
        checkoutUrl: 'https://checkout.test/1',
      }),
    );
    expect(result).toEqual({
      paymentAttemptId: ATTEMPT_ID,
      preferenceId: 'checkout-1',
      initPoint: 'https://checkout.test/1',
      sandboxInitPoint: 'https://checkout.test/1',
    });
  });

  it('persists a pending COP attempt before requesting a checkout', async () => {
    const createdAttempt = attempt();
    const values = jest.fn().mockReturnValue({
      returning: jest.fn().mockResolvedValue([createdAttempt]),
    });
    const tx = {
      select: jest.fn()
        .mockReturnValueOnce(txQuery([{ id: BOOKING_ID, userId: 'user-1', totalPrice: '90000.00', status: 'pending' }]))
        .mockReturnValueOnce(txQuery([]))
        .mockReturnValueOnce(txQuery([]))
        .mockReturnValueOnce(txQuery([])),
      insert: jest.fn().mockReturnValue({ values }),
    };
    const { service } = serviceWith({
      transaction: jest.fn((callback: (t: typeof tx) => unknown) => callback(tx)),
    });
    const internal = service as unknown as {
      resolveOrCreateCheckoutAttempt: (
        bookingId: string,
        key: string,
        userId: string,
        userRole: UserRole,
        dto: { bookingId: string },
      ) => Promise<Payment>;
    };

    await expect(
      internal.resolveOrCreateCheckoutAttempt(
        BOOKING_ID,
        KEY,
        'user-1',
        UserRole.USER,
        { bookingId: BOOKING_ID },
      ),
    ).resolves.toBe(createdAttempt);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: BOOKING_ID,
        provider: 'polar',
        idempotencyKey: KEY,
        amount: '90000',
        currency: OFFICIAL_CURRENCY,
        paymentFlow: PaymentFlow.HOSTED_CHECKOUT,
        status: PaymentStatus.PENDING,
      }),
    );
  });

  it('reuses the winner when the unique open-attempt index wins a race', async () => {
    const winner = attempt();
    const returning = jest.fn().mockRejectedValue({ code: '23505' });
    const values = jest.fn().mockReturnValue({ returning });
    const tx = {
      select: jest.fn()
        .mockReturnValueOnce(txQuery([{ id: BOOKING_ID, userId: 'user-1', totalPrice: '90000.00', status: 'pending' }]))
        .mockReturnValueOnce(txQuery([]))
        .mockReturnValueOnce(txQuery([]))
        .mockReturnValueOnce(txQuery([])),
      insert: jest.fn().mockReturnValue({ values }),
    };
    const { service } = serviceWith({
      transaction: jest.fn((callback: (t: typeof tx) => unknown) => callback(tx)),
      select: jest.fn().mockReturnValue(selectQuery([winner])),
    });
    const internal = service as unknown as {
      resolveOrCreateCheckoutAttempt: (
        bookingId: string,
        key: string,
        userId: string,
        userRole: UserRole,
        dto: { bookingId: string },
      ) => Promise<Payment>;
    };

    await expect(
      internal.resolveOrCreateCheckoutAttempt(
        BOOKING_ID,
        'checkout-key-0002',
        'user-1',
        UserRole.USER,
        { bookingId: BOOKING_ID },
      ),
    ).resolves.toBe(winner);
  });

  it('does not reopen a terminal same-key attempt or call the provider', async () => {
    const failed = attempt({
      status: PaymentStatus.FAILED,
      failureReason: 'provider rejected the payment',
    });
    const tx = {
      select: jest.fn()
        .mockReturnValueOnce(txQuery([{ id: BOOKING_ID, userId: 'user-1', totalPrice: '90000.00', status: 'pending' }]))
        .mockReturnValueOnce(txQuery([failed])),
    };
    const { service, provider, db, updateSet } = serviceWith({
      transaction: jest.fn((callback: (t: typeof tx) => unknown) => callback(tx)),
    });
    const internal = internals(service);
    internal.getBookingOrThrow = jest.fn().mockResolvedValue({
      id: BOOKING_ID,
      userId: 'user-1',
      totalPrice: '90000.00',
    });

    await expect(
      service.createPreference(
        { bookingId: BOOKING_ID },
        'user-1',
        UserRole.USER,
        KEY,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(updateSet).not.toHaveBeenCalled();
    expect(provider.createCheckout).not.toHaveBeenCalled();
  });

  it('keeps an ambiguous hosted-checkout attempt open and never automatically retries', async () => {
    const pending = attempt();
    const processing = attempt({
      status: PaymentStatus.PROCESSING,
      manualReview: true,
      manualReviewReason: 'Provider checkout outcome is uncertain; reconcile before retrying',
    });
    const tx = {
      select: jest.fn()
        .mockReturnValueOnce(txQuery([{ id: BOOKING_ID, userId: 'user-1', totalPrice: '90000.00', status: 'pending' }]))
        .mockReturnValueOnce(txQuery([pending])),
      update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn(() => ({ returning: jest.fn().mockResolvedValue([processing]) })) })) })),
      insert: jest.fn(() => ({ values: jest.fn().mockResolvedValue(undefined) })),
    };
    const { service, provider } = serviceWith({
      transaction: jest.fn((callback: (t: typeof tx) => unknown) => callback(tx)),
    });
    const internal = internals(service);
    internal.getBookingOrThrow = jest.fn().mockResolvedValue({
      id: BOOKING_ID,
      userId: 'user-1',
      totalPrice: '90000.00',
    });
    internal.resolveOrCreateCheckoutAttempt = jest.fn()
      .mockResolvedValueOnce(pending)
      .mockResolvedValue(processing);
    (provider.createCheckout as jest.Mock).mockRejectedValue(new Error('provider timeout'));

    await expect(service.createPreference({ bookingId: BOOKING_ID }, 'user-1', UserRole.USER, KEY))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'PAYMENT_ATTEMPT_RECONCILIATION_REQUIRED' }) });
    await expect(service.createPreference({ bookingId: BOOKING_ID }, 'user-1', UserRole.USER, KEY))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'PAYMENT_ATTEMPT_RECONCILIATION_REQUIRED' }) });
    expect(provider.createCheckout).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalledTimes(1);
  });
});
