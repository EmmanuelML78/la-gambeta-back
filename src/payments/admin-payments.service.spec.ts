import { PgDialect } from 'drizzle-orm/pg-core';
import { BookingStatus, PaymentStatus } from '../common/enums';
import { bookings } from '../database/schema';
import { AdminPaymentQueryDto } from './dto';
import { AdminPaymentsService } from './admin-payments.service';

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
