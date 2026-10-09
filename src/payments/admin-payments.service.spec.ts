import { PgDialect } from 'drizzle-orm/pg-core';
import { BookingStatus, PaymentStatus } from '../common/enums';
import { OFFICIAL_CURRENCY } from '../common/payment.constants';
import { auditEvents, bookings, payments } from '../database/schema';
import { AdminPaymentQueryDto } from './dto';
import { AdminPaymentsService } from './admin-payments.service';
import { LATE_PAYMENT_RECONCILIATION_ACTION } from './payment-reconciliation.constants';

function chain(methods: string[], terminal: string, result: unknown) {
  const query: Record<string, jest.Mock> = {};
  for (const method of methods) query[method] = jest.fn().mockReturnValue(query);
  query[terminal] = jest.fn().mockResolvedValue(result);
  return query;
}

describe('AdminPaymentsService.findAll', () => {
  it('returns joined page metadata with stable ordering and no user PII selection', async () => {
    const createdAt = new Date('2026-08-31T12:00:00.000Z');
    const row = {
      id: '92d18ac6-c3af-4cfa-ae7f-a847f3163608',
      provider: 'polar',
      status: PaymentStatus.SUCCEEDED,
      amount: '120000.00',
      currency: 'COP',
      refundedAmount: null,
      createdAt,
      updatedAt: createdAt,
      bookingId: 'aac8dc30-b7f9-45c4-a12a-0dceaf0f1522',
      bookingStatus: BookingStatus.ACTIVE,
      bookingDate: createdAt,
      startTime: '18:00',
      endTime: '19:00',
      courtId: '42d18ac6-c3af-4cfa-ae7f-a847f3163608',
      courtName: 'Cancha Norte',
      venueId: null,
      venueName: null,
    };
    const page = chain(['from', 'innerJoin', 'innerJoin', 'leftJoin', 'where', 'orderBy', 'limit'], 'offset', [row]);
    const count = chain(['from', 'innerJoin', 'innerJoin', 'leftJoin'], 'where', [{ total: '41' }]);
    const select = jest.fn().mockReturnValueOnce(page).mockReturnValueOnce(count);
    const service = new AdminPaymentsService({ db: { select } } as never);
    const query = { page: 3, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' } as AdminPaymentQueryDto;

    const result = await service.findAll(query);
    const dialect = new PgDialect();
    const order = (page.orderBy.mock.calls[0] as unknown[]).map((value) => dialect.sqlToQuery(value as never).sql);
    expect(page.limit).toHaveBeenCalledWith(20);
    expect(page.offset).toHaveBeenCalledWith(40);
    expect(order).toEqual(['"payments"."created_at" desc', '"payments"."id" desc']);
    expect(result).toEqual({
      items: [{
        id: row.id, provider: 'polar', status: PaymentStatus.SUCCEEDED,
        amount: '120000.00', currency: 'COP', refundedAmount: null,
        createdAt, updatedAt: createdAt,
        booking: { id: row.bookingId, status: BookingStatus.ACTIVE, bookingDate: createdAt, startTime: '18:00', endTime: '19:00' },
        court: { id: row.courtId, name: 'Cancha Norte' }, venue: null,
      }],
      total: 41, page: 3, limit: 20, totalPages: 3,
    });
    const selection = select.mock.calls[0][0] as Record<string, unknown>;
    expect(selection).not.toHaveProperty('email');
    expect(selection).not.toHaveProperty('userId');
    expect(selection).not.toHaveProperty('firstName');
    expect(selection).not.toHaveProperty('lastName');
    expect(selection.bookingStatus).toBe(bookings.status);
  });

  it('returns zero pages for an empty result', async () => {
    const page = chain(['from', 'innerJoin', 'innerJoin', 'leftJoin', 'where', 'orderBy', 'limit'], 'offset', []);
    const count = chain(['from', 'innerJoin', 'innerJoin', 'leftJoin'], 'where', []);
    const service = new AdminPaymentsService({ db: { select: jest.fn().mockReturnValueOnce(page).mockReturnValueOnce(count) } } as never);
    expect(await service.findAll({ page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' } as AdminPaymentQueryDto)
      ).toMatchObject({ items: [], total: 0, totalPages: 0 });
  });
});

describe('AdminPaymentsService.summary', () => {
  it('returns canonical COP aggregates and filters late-payment reconciliation events', async () => {
    const totals = chain(['from'], 'where', [{
      grossAmount: '500000.00', refundedAmount: '100000.00', netAmount: '400000.00',
      attemptCount: '9', successfulCount: '4', openCount: '2', failedCount: '3', refundedCount: '1',
    }]);
    const statuses = chain(['from', 'where'], 'groupBy', [
      { status: PaymentStatus.SUCCEEDED, total: '3' },
      { status: PaymentStatus.REFUNDED, total: '1' },
    ]);
    const reconciliation = chain(['from', 'innerJoin'], 'where', [{ total: '2' }]);
    const select = jest.fn().mockReturnValueOnce(totals).mockReturnValueOnce(statuses).mockReturnValueOnce(reconciliation);
    const result = await new AdminPaymentsService({ db: { select } } as never).summary();
    expect(result).toMatchObject({
      currency: OFFICIAL_CURRENCY, grossAmount: '500000.00', refundedAmount: '100000.00',
      netAmount: '400000.00', attemptCount: 9, successfulCount: 4, openCount: 2,
      failedCount: 3, refundedCount: 1, reconciliationEventCount: 2,
      statusCounts: { [PaymentStatus.SUCCEEDED]: 3, [PaymentStatus.REFUNDED]: 1, [PaymentStatus.PENDING]: 0 },
    });
  });

  it('returns zeroed aggregates and a complete status map when there is no data', async () => {
    const totals = chain(['from'], 'where', []);
    const statuses = chain(['from', 'where'], 'groupBy', []);
    const reconciliation = chain(['from', 'innerJoin'], 'where', []);
    const select = jest.fn().mockReturnValueOnce(totals).mockReturnValueOnce(statuses).mockReturnValueOnce(reconciliation);
    const result = await new AdminPaymentsService({ db: { select } } as never).summary();
    expect(result.currency).toBe('COP');
    expect(result.grossAmount).toBe('0');
    expect(result.refundedAmount).toBe('0');
    expect(result.netAmount).toBe('0');
    expect(result.attemptCount).toBe(0);
    expect(result.reconciliationEventCount).toBe(0);
    expect(Object.values(result.statusCounts)).toEqual(Array(Object.values(PaymentStatus).length).fill(0));
  });

  it('uses official currency and the exact reconciliation action as query predicates', async () => {
    const totals = chain(['from'], 'where', []);
    const statuses = chain(['from', 'where'], 'groupBy', []);
    const reconciliation = chain(['from', 'innerJoin'], 'where', []);
    const select = jest.fn().mockReturnValueOnce(totals).mockReturnValueOnce(statuses).mockReturnValueOnce(reconciliation);
    await new AdminPaymentsService({ db: { select } } as never).summary();
    const dialect = new PgDialect();
    for (const where of [totals.where.mock.calls[0][0], statuses.where.mock.calls[0][0]]) {
      const compiled = dialect.sqlToQuery(where);
      expect(compiled.sql).toContain('currency');
      expect(compiled.params).toContain(OFFICIAL_CURRENCY);
    }
    const reconciliationWhere = dialect.sqlToQuery(reconciliation.where.mock.calls[0][0]);
    const reconciliationJoin = dialect.sqlToQuery(reconciliation.innerJoin.mock.calls[0][1]);
    expect(reconciliationWhere.sql).toContain('action');
    expect(reconciliationWhere.sql).toContain('entity_type');
    expect(reconciliationWhere.sql).toContain('currency');
    expect(reconciliationWhere.params).toEqual([
      LATE_PAYMENT_RECONCILIATION_ACTION,
      'payment',
      OFFICIAL_CURRENCY,
    ]);
    expect(reconciliationJoin.sql).toContain('entity_id');
    expect(reconciliationJoin.sql).toContain('payments');
    const aggregateSelection = select.mock.calls[0][0] as Record<string, unknown>;
    const gross = dialect.sqlToQuery(aggregateSelection.grossAmount as never);
    const refunded = dialect.sqlToQuery(aggregateSelection.refundedAmount as never);
    const net = dialect.sqlToQuery(aggregateSelection.netAmount as never);
    expect(gross.sql).toContain('sum(case when');
    expect(refunded.sql).toContain('coalesce("payments"."refunded_amount", 0)');
    expect(net.sql).toContain(' - ');
    expect(select.mock.calls[1][0]).toEqual({ status: payments.status, total: expect.anything() });
    expect(select.mock.calls[2][0]).toEqual({ total: expect.anything() });
    expect(totals.where.mock.calls[0][0]).not.toBe(auditEvents.action);
  });
});
