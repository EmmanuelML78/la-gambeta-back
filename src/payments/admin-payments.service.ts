import { Injectable } from '@nestjs/common';
import { count, eq } from 'drizzle-orm';
import { DrizzleService } from '../database/drizzle.service';
import {
  bookings,
  courts,
  payments,
  venues,
} from '../database/schema';
import { buildAdminPaymentConditions, buildAdminPaymentOrder, validateAdminPaymentDateRange } from './admin-payment-query';
import type { AdminPaymentPageDto, AdminPaymentQueryDto } from './dto';

@Injectable()
export class AdminPaymentsService {
  constructor(private readonly drizzle: DrizzleService) {}

  async findAll(query: AdminPaymentQueryDto): Promise<AdminPaymentPageDto> {
    validateAdminPaymentDateRange(query.dateFrom, query.dateTo);
    const where = buildAdminPaymentConditions(query);
    const order = buildAdminPaymentOrder(query);
    const offset = (query.page - 1) * query.limit;
    const selection = {
      id: payments.id,
      provider: payments.provider,
      status: payments.status,
      amount: payments.amount,
      currency: payments.currency,
      refundedAmount: payments.refundedAmount,
      createdAt: payments.createdAt,
      updatedAt: payments.updatedAt,
      bookingId: bookings.id,
      bookingStatus: bookings.status,
      bookingDate: bookings.bookingDate,
      startTime: bookings.startTime,
      endTime: bookings.endTime,
      courtId: courts.id,
      courtName: courts.name,
      venueId: venues.id,
      venueName: venues.name,
    };
    const [rows, totalRows] = await Promise.all([
      this.drizzle.db
        .select(selection)
        .from(payments)
        .innerJoin(bookings, eq(payments.bookingId, bookings.id))
        .innerJoin(courts, eq(bookings.courtId, courts.id))
        .leftJoin(venues, eq(courts.venueId, venues.id))
        .where(where)
        .orderBy(...order)
        .limit(query.limit)
        .offset(offset),
      this.drizzle.db
        .select({ total: count() })
        .from(payments)
        .innerJoin(bookings, eq(payments.bookingId, bookings.id))
        .innerJoin(courts, eq(bookings.courtId, courts.id))
        .leftJoin(venues, eq(courts.venueId, venues.id))
        .where(where),
    ]);
    const total = Number(totalRows[0]?.total ?? 0);
    return {
      items: rows.map((row) => this.projectListItem(row)),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
    };
  }

  private projectListItem(row: {
    id: string;
    provider: string | null;
    status: (typeof payments.$inferSelect)['status'];
    amount: string;
    currency: string;
    refundedAmount: string | null;
    createdAt: Date;
    updatedAt: Date;
    bookingId: string;
    bookingStatus: (typeof bookings.$inferSelect)['status'];
    bookingDate: Date;
    startTime: string;
    endTime: string;
    courtId: string;
    courtName: string;
    venueId: string | null;
    venueName: string | null;
  }): AdminPaymentPageDto['items'][number] {
    return {
      id: row.id,
      provider: row.provider,
      status: row.status,
      amount: row.amount,
      currency: row.currency,
      refundedAmount: row.refundedAmount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      booking: {
        id: row.bookingId,
        status: row.bookingStatus,
        bookingDate: row.bookingDate,
        startTime: row.startTime,
        endTime: row.endTime,
      },
      court: { id: row.courtId, name: row.courtName },
      venue: row.venueId && row.venueName
        ? { id: row.venueId, name: row.venueName }
        : null,
    };
  }
}
