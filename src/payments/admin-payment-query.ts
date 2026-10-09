import { BadRequestException } from '@nestjs/common';
import { SQL, and, asc, desc, eq, gte, lt, or, sql } from 'drizzle-orm';
import { bookings, courts, payments, venues } from '../database/schema';
import {
  AdminPaymentQueryDto,
  AdminPaymentSortDirection,
  AdminPaymentSortField,
} from './dto';

const BOGOTA_UTC_OFFSET_HOURS = 5;

export function parseAdminPaymentBogotaDate(value: string): Date {
  const date = new Date(
    `${value}T${String(BOGOTA_UTC_OFFSET_HOURS).padStart(2, '0')}:00:00.000Z`,
  );
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new BadRequestException('Invalid Bogotá calendar date');
  }
  return date;
}

export function validateAdminPaymentDateRange(
  dateFrom?: string,
  dateTo?: string,
): void {
  const from = dateFrom ? parseAdminPaymentBogotaDate(dateFrom) : undefined;
  const to = dateTo ? parseAdminPaymentBogotaDate(dateTo) : undefined;
  if (!from || !to) return;
  if (from > to) {
    throw new BadRequestException('dateFrom must not exceed dateTo');
  }
  const days = (to.getTime() - from.getTime()) / 86_400_000;
  if (days > 366) {
    throw new BadRequestException('Date range must not exceed 366 days');
  }
}

export function buildAdminPaymentConditions(
  query: AdminPaymentQueryDto,
): SQL | undefined {
  const conditions: SQL[] = [];
  if (query.status) conditions.push(eq(payments.status, query.status));
  if (query.provider) conditions.push(eq(payments.provider, query.provider));
  if (query.venueId) conditions.push(eq(venues.id, query.venueId));
  if (query.courtId) conditions.push(eq(courts.id, query.courtId));
  if (query.dateFrom) {
    conditions.push(
      gte(payments.createdAt, parseAdminPaymentBogotaDate(query.dateFrom)),
    );
  }
  if (query.dateTo) {
    const exclusiveEnd = parseAdminPaymentBogotaDate(query.dateTo);
    exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
    conditions.push(lt(payments.createdAt, exclusiveEnd));
  }
  if (query.search) {
    const escaped = query.search.replace(/[\\%_]/g, '\\$&').toLowerCase();
    const pattern = `%${escaped}%`;
    conditions.push(
      or(
        sql`lower(${payments.id}::text) like ${pattern} escape '\\'`,
        sql`lower(${bookings.id}::text) like ${pattern} escape '\\'`,
        sql`lower(${courts.name}) like ${pattern} escape '\\'`,
        sql`lower(coalesce(${venues.name}, '')) like ${pattern} escape '\\'`,
        sql`lower(coalesce(${payments.provider}, '')) like ${pattern} escape '\\'`,
      )!,
    );
  }
  return conditions.length ? and(...conditions) : undefined;
}

export function buildAdminPaymentOrder(query: AdminPaymentQueryDto): SQL[] {
  const sortColumn = {
    [AdminPaymentSortField.CREATED_AT]: payments.createdAt,
    [AdminPaymentSortField.AMOUNT]: payments.amount,
    [AdminPaymentSortField.STATUS]: payments.status,
    [AdminPaymentSortField.PROVIDER]: payments.provider,
    [AdminPaymentSortField.REFUNDED_AMOUNT]: payments.refundedAmount,
  }[query.sortBy];
  const direction =
    query.sortOrder === AdminPaymentSortDirection.ASC ? asc : desc;
  return [direction(sortColumn), direction(payments.id)];
}
