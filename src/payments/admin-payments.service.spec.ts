import { NotFoundException } from '@nestjs/common';
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
    expect(reconciliationJoin.sql).toContain('"payments"."id"::text');
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

describe('AdminPaymentsService.findDetail', () => {
  it('returns explicit payment, booking, user, safe evidence, reconciliation, and refund context', async () => {
    const createdAt = new Date('2026-09-10T12:00:00.000Z');
    const paymentId = '92d18ac6-c3af-4cfa-ae7f-a847f3163608';
    const bookingId = 'aac8dc30-b7f9-45c4-a12a-0dceaf0f1522';
    const row = {
      id: paymentId, provider: 'polar', status: PaymentStatus.SUCCEEDED,
      amount: '120000.00', currency: 'COP', refundedAmount: null,
      createdAt, updatedAt: createdAt, paymentMethod: 'credit_card',
      paymentType: 'credit_card', installments: 1, dateApproved: createdAt,
      manualReview: true,
      manualReviewReason: 'Payment succeeded after booking entered CANCELLED; manual reconciliation required',
      bookingId, bookingStatus: BookingStatus.CANCELLED,
      bookingDate: new Date('2026-09-10T00:00:00.000Z'), startTime: '18:30', endTime: '19:30',
      userId: 'user-1', userName: null, firstName: 'Ana', lastName: 'Perez',
      courtId: '42d18ac6-c3af-4cfa-ae7f-a847f3163608', courtName: 'Cancha Norte',
      venueId: null, venueName: null,
    };
    const base = chain(['from', 'innerJoin', 'innerJoin', 'innerJoin', 'leftJoin', 'where'], 'limit', [row]);
    const events = chain(['from', 'where'], 'orderBy', [{
      id: 'event-1', fromStatus: PaymentStatus.PROCESSING, toStatus: PaymentStatus.SUCCEEDED,
      actorType: 'provider', source: 'webhook', reason: 'payment_succeeded', createdAt,
    }]);
    const audits = chain(['from', 'where'], 'orderBy', [{
      id: 'audit-1', action: 'late_payment_requires_reconciliation', actorType: 'provider',
      source: 'webhook', reason: 'late_payment_requires_reconciliation', createdAt,
      metadata: { cardToken: 'private' },
    }]);
    const history = chain(['from', 'where'], 'orderBy', [{
      id: 'history-1', toStatus: BookingStatus.CANCELLED,
      reason: 'booking_cancelled', createdAt: new Date('2026-09-09T23:30:00.000Z'),
    }]);
    const select = jest.fn()
      .mockReturnValueOnce(base)
      .mockReturnValueOnce(events)
      .mockReturnValueOnce(audits)
      .mockReturnValueOnce(history);

    const result = await new AdminPaymentsService({ db: { select } } as never).findDetail(paymentId);
    expect(result).toMatchObject({
      id: paymentId, status: PaymentStatus.SUCCEEDED, amount: '120000.00',
      booking: { id: bookingId, status: BookingStatus.CANCELLED },
      user: { id: 'user-1', displayName: 'Ana Perez' },
      events: [{ actorType: 'provider', source: 'webhook', reasonCode: 'payment_succeeded' }],
      audits: [{ action: 'late_payment_requires_reconciliation' }],
      reconciliation: { status: 'requires_attention', reasonCode: 'late_payment_requires_reconciliation' },
      refundEligibility: { status: 'eligible', percentage: 100 },
      refundCapability: { status: 'unavailable', reasonCode: 'provider_refund_not_supported' },
    });
    expect(result).not.toHaveProperty('email');
    expect(result).not.toHaveProperty('metadata');
    expect(result.audits[0]).not.toHaveProperty('metadata');

    const dialect = new PgDialect();
    const auditWhere = dialect.sqlToQuery(audits.where.mock.calls[0][0]);
    expect(auditWhere.params).toEqual(['payment', paymentId, 'booking', bookingId, `attempt:${paymentId}`]);
    expect(auditWhere.sql).toContain('"audit_events"."entity_id" = $2');
    expect(auditWhere.sql).toContain('"audit_events"."entity_id" = $4');
    expect(auditWhere.sql).toContain('"audit_events"."correlation_id" = $5');
    expect(dialect.sqlToQuery(events.orderBy.mock.calls[0][0]).sql).toContain('"payment_events"."created_at" asc');
    expect(dialect.sqlToQuery(history.orderBy.mock.calls[0][1]).sql).toContain('"booking_status_history"."id" asc');
    const paymentSelection = select.mock.calls[0][0] as Record<string, unknown>;
    const auditSelection = select.mock.calls[2][0] as Record<string, unknown>;
    expect(paymentSelection).not.toHaveProperty('email');
    expect(paymentSelection).not.toHaveProperty('metadata');
    expect(auditSelection).not.toHaveProperty('metadata');
  });

  it('keeps resolved review history without reporting a current review flag', async () => {
    const createdAt = new Date('2026-09-10T12:00:00.000Z');
    const paymentId = '92d18ac6-c3af-4cfa-ae7f-a847f3163608';
    const row = {
      id: paymentId, provider: 'polar', status: PaymentStatus.SUCCEEDED,
      amount: '120000.00', currency: 'COP', refundedAmount: null,
      createdAt, updatedAt: createdAt, paymentMethod: 'credit_card',
      paymentType: 'credit_card', installments: 1, dateApproved: createdAt,
      manualReview: false,
      manualReviewReason: 'Payment succeeded after booking entered CANCELLED; manual reconciliation required',
      bookingId: 'aac8dc30-b7f9-45c4-a12a-0dceaf0f1522',
      bookingStatus: BookingStatus.ACTIVE, bookingDate: createdAt,
      startTime: '18:30', endTime: '19:30', userId: 'user-1', userName: 'Ana Perez',
      firstName: null, lastName: null, courtId: '42d18ac6-c3af-4cfa-ae7f-a847f3163608',
      courtName: 'Cancha Norte', venueId: null, venueName: null,
    };
    const base = chain(['from', 'innerJoin', 'innerJoin', 'innerJoin', 'leftJoin', 'where'], 'limit', [row]);
    const events = chain(['from', 'where'], 'orderBy', []);
    const audits = chain(['from', 'where'], 'orderBy', [{
      id: 'audit-1', action: 'late_payment_after_booking_terminal', actorType: 'provider',
      source: 'webhook', reason: 'late_payment_after_booking_terminal', createdAt,
    }]);
    const history = chain(['from', 'where'], 'orderBy', []);
    const select = jest.fn()
      .mockReturnValueOnce(base)
      .mockReturnValueOnce(events)
      .mockReturnValueOnce(audits)
      .mockReturnValueOnce(history);

    const result = await new AdminPaymentsService({ db: { select } } as never).findDetail(paymentId);
    expect(result.audits).toHaveLength(1);
    expect(result.reconciliation).toEqual({ status: 'no_flags', reasonCode: null });
  });

  it('projects uncertain provider review reason without exposing free-form metadata', async () => {
    const createdAt = new Date('2026-09-10T12:00:00.000Z');
    const paymentId = '92d18ac6-c3af-4cfa-ae7f-a847f3163608';
    const base = chain(['from', 'innerJoin', 'innerJoin', 'innerJoin', 'leftJoin', 'where'], 'limit', [{
      id: paymentId, provider: 'polar', status: PaymentStatus.PROCESSING,
      amount: '120000.00', currency: 'COP', refundedAmount: null,
      createdAt, updatedAt: createdAt, paymentMethod: null, paymentType: null,
      installments: null, dateApproved: null, manualReview: true,
      manualReviewReason: 'Provider checkout outcome is uncertain; reconcile before retrying',
      bookingId: 'aac8dc30-b7f9-45c4-a12a-0dceaf0f1522', bookingStatus: BookingStatus.PENDING,
      bookingDate: createdAt, startTime: '18:30', endTime: '19:30',
      userId: 'user-1', userName: 'Ana Perez', firstName: null, lastName: null,
      courtId: '42d18ac6-c3af-4cfa-ae7f-a847f3163608', courtName: 'Cancha Norte',
      venueId: null, venueName: null,
    }]);
    const select = jest.fn()
      .mockReturnValueOnce(base)
      .mockReturnValueOnce(chain(['from', 'where'], 'orderBy', []))
      .mockReturnValueOnce(chain(['from', 'where'], 'orderBy', []))
      .mockReturnValueOnce(chain(['from', 'where'], 'orderBy', []));

    const result = await new AdminPaymentsService({ db: { select } } as never).findDetail(paymentId);
    expect(result.reconciliation).toEqual({ status: 'requires_attention', reasonCode: 'provider_outcome_uncertain' });
    expect(result).not.toHaveProperty('manualReviewReason');
  });

  it('scopes booking audit history to the exact attempt when a booking has multiple payments', async () => {
    const bookingId = 'aac8dc30-b7f9-45c4-a12a-0dceaf0f1522';
    const paymentIds = [
      '92d18ac6-c3af-4cfa-ae7f-a847f3163608',
      '82d18ac6-c3af-4cfa-ae7f-a847f3163608',
    ];
    const select = jest.fn();
    for (const paymentId of paymentIds) {
      const base = chain(['from', 'innerJoin', 'innerJoin', 'innerJoin', 'leftJoin', 'where'], 'limit', [{
        id: paymentId, provider: 'polar', status: PaymentStatus.SUCCEEDED,
        amount: '120000.00', currency: 'COP', refundedAmount: null,
        createdAt: new Date('2026-09-10T12:00:00.000Z'), updatedAt: new Date('2026-09-10T12:00:00.000Z'),
        paymentMethod: null, paymentType: null, installments: null, dateApproved: null,
        manualReview: false, manualReviewReason: null, bookingId, bookingStatus: BookingStatus.ACTIVE,
        bookingDate: new Date('2026-09-10T00:00:00.000Z'), startTime: '18:30', endTime: '19:30',
        userId: 'user-1', userName: 'Ana Perez', firstName: null, lastName: null,
        courtId: '42d18ac6-c3af-4cfa-ae7f-a847f3163608', courtName: 'Cancha Norte',
        venueId: null, venueName: null,
      }]);
      select
        .mockReturnValueOnce(base)
        .mockReturnValueOnce(chain(['from', 'where'], 'orderBy', []))
        .mockReturnValueOnce(chain(['from', 'where'], 'orderBy', []))
        .mockReturnValueOnce(chain(['from', 'where'], 'orderBy', []));
    }

    const service = new AdminPaymentsService({ db: { select } } as never);
    for (const paymentId of paymentIds) await service.findDetail(paymentId);
    const dialect = new PgDialect();
    const auditQueries = [select.mock.results[2].value, select.mock.results[6].value];
    for (const [index, auditQuery] of auditQueries.entries()) {
      const compiled = dialect.sqlToQuery(auditQuery.where.mock.calls[0][0]);
      expect(compiled.params).toEqual(['payment', paymentIds[index], 'booking', bookingId, `attempt:${paymentIds[index]}`]);
      expect(compiled.sql).toContain('"audit_events"."entity_id" = $4');
      expect(compiled.sql).toContain('"audit_events"."correlation_id" = $5');
    }
  });

  it('throws not found without issuing evidence queries when payment is absent', async () => {
    const base = chain(['from', 'innerJoin', 'innerJoin', 'innerJoin', 'leftJoin', 'where'], 'limit', []);
    const select = jest.fn().mockReturnValue(base);
    await expect(new AdminPaymentsService({ db: { select } } as never).findDetail('92d18ac6-c3af-4cfa-ae7f-a847f3163608'))
      .rejects.toThrow(NotFoundException);
    expect(select).toHaveBeenCalledTimes(1);
  });
});
