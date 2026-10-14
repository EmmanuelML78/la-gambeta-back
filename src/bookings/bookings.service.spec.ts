import { PgDialect } from 'drizzle-orm/pg-core';
import { BookingStatus } from '../common/enums';
import { bookings } from '../database/schema';
import { AdminBookingQueryDto } from './dto';
import { BookingsService } from './bookings.service';

function chain(methods: string[], terminal: string, result: unknown) {
  const query: Record<string, jest.Mock> = {};
  for (const method of methods)
    query[method] = jest.fn().mockReturnValue(query);
  query[terminal] = jest.fn().mockResolvedValue(result);
  return query;
}

describe('BookingsService.findAllAdminPaginated', () => {
  it('filters status in both queries, pages in SQL, orders stably, and returns a minimized projection', async () => {
    const createdAt = new Date('2026-09-01T12:00:00.000Z');
    const row = {
      id: 'booking-1',
      bookingDate: createdAt,
      startTime: '18:00',
      endTime: '19:00',
      status: BookingStatus.PENDING,
      totalPrice: '50000.00',
      createdAt,
      userId: 'user-1',
      userName: 'Ana Perez',
      courtId: 'court-1',
      courtName: 'Cancha Norte',
      notes: 'Private scheduling note',
      user: {
        email: 'ana.private@example.com',
        firstName: 'Ana',
        lastName: 'Perez',
      },
      court: {
        description: 'Internal court description',
        imageUrl: 'https://example.test/court.png',
        pricePerHour: '75000.00',
        surface: 'private court metadata',
      },
    };
    const page = chain(
      ['from', 'leftJoin', 'leftJoin', 'where', 'orderBy', 'limit'],
      'offset',
      [row],
    );
    const countQuery = chain(['from'], 'where', [{ total: 41 }]);
    const select = jest
      .fn()
      .mockReturnValueOnce(page)
      .mockReturnValueOnce(countQuery);
    const service = new BookingsService({ db: { select } } as never);
    const query = {
      page: 3,
      limit: 20,
      status: BookingStatus.PENDING,
    } as AdminBookingQueryDto;

    const result = await service.findAllAdminPaginated(query);
    const dialect = new PgDialect();
    const order = (page.orderBy.mock.calls[0] as unknown[]).map(
      (value) => dialect.sqlToQuery(value as never).sql,
    );

    expect(page.limit).toHaveBeenCalledWith(20);
    expect(page.offset).toHaveBeenCalledWith(40);
    expect(order).toEqual([
      '"bookings"."created_at" desc',
      '"bookings"."id" desc',
    ]);
    expect(dialect.sqlToQuery(page.where.mock.calls[0][0]).params).toEqual([
      BookingStatus.PENDING,
    ]);
    expect(
      dialect.sqlToQuery(countQuery.where.mock.calls[0][0]).params,
    ).toEqual([BookingStatus.PENDING]);
    expect(result).toEqual({
      items: [
        {
          id: row.id,
          bookingDate: createdAt,
          startTime: '18:00',
          endTime: '19:00',
          status: BookingStatus.PENDING,
          totalPrice: '50000.00',
          user: { id: 'user-1', name: 'Ana Perez' },
          court: { id: 'court-1', name: 'Cancha Norte' },
        },
      ],
      total: 41,
      page: 3,
      limit: 20,
      totalPages: 3,
    });
    const selection = select.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(selection).sort()).toEqual(
      [
        'id',
        'bookingDate',
        'startTime',
        'endTime',
        'status',
        'totalPrice',
        'createdAt',
        'userId',
        'userName',
        'courtId',
        'courtName',
      ].sort(),
    );
    expect(result.items[0]).not.toHaveProperty('notes');
    expect(result.items[0]).not.toHaveProperty('user.email');
    expect(result.items[0]).not.toHaveProperty('court.description');
    expect(result.items[0]).not.toHaveProperty('court.imageUrl');
    expect(result.items[0]).not.toHaveProperty('court.pricePerHour');
    expect(selection.status).toBe(bookings.status);
  });

  it('reports zero pages for an empty filtered result', async () => {
    const page = chain(
      ['from', 'leftJoin', 'leftJoin', 'where', 'orderBy', 'limit'],
      'offset',
      [],
    );
    const countQuery = chain(['from'], 'where', [{ total: 0 }]);
    const select = jest
      .fn()
      .mockReturnValueOnce(page)
      .mockReturnValueOnce(countQuery);
    const service = new BookingsService({ db: { select } } as never);
    const result = await service.findAllAdminPaginated({
      page: 1,
      limit: 20,
    } as AdminBookingQueryDto);
    expect(result).toMatchObject({ items: [], total: 0, totalPages: 0 });
  });
});
