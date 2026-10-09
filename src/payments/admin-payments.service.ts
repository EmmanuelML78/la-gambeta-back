import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, or, sql } from 'drizzle-orm';
import { BookingStatus, PaymentStatus } from '../common/enums';
import { resolveBookingRefundEligibility } from '../bookings/booking-refund-eligibility';
import { OFFICIAL_CURRENCY } from '../common/payment.constants';
import { DrizzleService } from '../database/drizzle.service';
import {
  auditEvents,
  bookingStatusHistory,
  bookings,
  courts,
  payments,
  paymentEvents,
  users,
  venues,
} from '../database/schema';
import { projectSafeAdminPaymentAudit, projectSafeAdminPaymentEvent } from './admin-payment-evidence';
import { buildAdminPaymentConditions, buildAdminPaymentOrder, validateAdminPaymentDateRange } from './admin-payment-query';
import { buildPaymentFinancialSummarySelection } from './payment-financial-summary';
import { LATE_PAYMENT_RECONCILIATION_ACTION } from './payment-reconciliation.constants';
import type { AdminPaymentDetailDto, AdminPaymentPageDto, AdminPaymentQueryDto, AdminPaymentSummaryDto } from './dto';

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

  async summary(): Promise<AdminPaymentSummaryDto> {
    const [totals, statusRows, reconciliationRows] = await Promise.all([
      this.drizzle.db
        .select(buildPaymentFinancialSummarySelection())
        .from(payments)
        .where(eq(payments.currency, OFFICIAL_CURRENCY)),
      this.drizzle.db
        .select({ status: payments.status, total: sql<number>`count(*)::int` })
        .from(payments)
        .where(eq(payments.currency, OFFICIAL_CURRENCY))
        .groupBy(payments.status),
      this.drizzle.db
        .select({ total: sql<number>`count(*)::int` })
        .from(auditEvents)
        .innerJoin(payments, eq(auditEvents.entityId, sql`${payments.id}::text`))
        .where(and(
          eq(auditEvents.action, LATE_PAYMENT_RECONCILIATION_ACTION),
          eq(auditEvents.entityType, 'payment'),
          eq(payments.currency, OFFICIAL_CURRENCY),
        )),
    ]);
    const aggregate = totals[0] ?? {
      grossAmount: '0',
      refundedAmount: '0',
      netAmount: '0',
      attemptCount: 0,
      successfulCount: 0,
      openCount: 0,
      failedCount: 0,
      refundedCount: 0,
    };
    const statusCounts = Object.fromEntries(
      Object.values(PaymentStatus).map((status) => [status, 0]),
    ) as Record<PaymentStatus, number>;
    for (const row of statusRows) statusCounts[row.status] = Number(row.total);
    return {
      currency: OFFICIAL_CURRENCY,
      grossAmount: aggregate.grossAmount,
      refundedAmount: aggregate.refundedAmount,
      netAmount: aggregate.netAmount,
      attemptCount: Number(aggregate.attemptCount),
      successfulCount: Number(aggregate.successfulCount),
      openCount: Number(aggregate.openCount),
      failedCount: Number(aggregate.failedCount),
      refundedCount: Number(aggregate.refundedCount),
      reconciliationEventCount: Number(reconciliationRows[0]?.total ?? 0),
      statusCounts,
    };
  }

  async findDetail(id: string): Promise<AdminPaymentDetailDto> {
    const [row] = await this.drizzle.db
      .select({
        id: payments.id,
        provider: payments.provider,
        status: payments.status,
        amount: payments.amount,
        currency: payments.currency,
        refundedAmount: payments.refundedAmount,
        createdAt: payments.createdAt,
        updatedAt: payments.updatedAt,
        paymentMethod: payments.paymentMethod,
        paymentType: payments.paymentType,
        installments: payments.installments,
        dateApproved: payments.dateApproved,
        manualReview: payments.manualReview,
        bookingId: bookings.id,
        bookingStatus: bookings.status,
        bookingDate: bookings.bookingDate,
        startTime: bookings.startTime,
        endTime: bookings.endTime,
        userId: users.id,
        userName: users.name,
        firstName: users.firstName,
        lastName: users.lastName,
        courtId: courts.id,
        courtName: courts.name,
        venueId: venues.id,
        venueName: venues.name,
      })
      .from(payments)
      .innerJoin(bookings, eq(payments.bookingId, bookings.id))
      .innerJoin(users, eq(bookings.userId, users.id))
      .innerJoin(courts, eq(bookings.courtId, courts.id))
      .leftJoin(venues, eq(courts.venueId, venues.id))
      .where(eq(payments.id, id))
      .limit(1);
    if (!row) throw new NotFoundException('Payment not found');

    const [eventRows, auditRows, historyRows] = await Promise.all([
      this.drizzle.db
        .select({
          id: paymentEvents.id,
          fromStatus: paymentEvents.fromStatus,
          toStatus: paymentEvents.toStatus,
          actorType: paymentEvents.actorType,
          source: paymentEvents.source,
          reason: paymentEvents.reason,
          createdAt: paymentEvents.createdAt,
        })
        .from(paymentEvents)
        .where(eq(paymentEvents.paymentId, row.id))
        .orderBy(asc(paymentEvents.createdAt), asc(paymentEvents.id)),
      this.drizzle.db
        .select({
          id: auditEvents.id,
          action: auditEvents.action,
          actorType: auditEvents.actorType,
          source: auditEvents.source,
          reason: auditEvents.reason,
          createdAt: auditEvents.createdAt,
        })
        .from(auditEvents)
        .where(or(
          and(eq(auditEvents.entityType, 'payment'), eq(auditEvents.entityId, row.id)),
          and(eq(auditEvents.entityType, 'booking'), eq(auditEvents.entityId, row.bookingId)),
        ))
        .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id)),
      this.drizzle.db
        .select({
          id: bookingStatusHistory.id,
          toStatus: bookingStatusHistory.toStatus,
          reason: bookingStatusHistory.reason,
          createdAt: bookingStatusHistory.createdAt,
        })
        .from(bookingStatusHistory)
        .where(eq(bookingStatusHistory.bookingId, row.bookingId))
        .orderBy(asc(bookingStatusHistory.createdAt), asc(bookingStatusHistory.id)),
    ]);
    const events = eventRows.map(projectSafeAdminPaymentEvent);
    const audits = auditRows
      .map(projectSafeAdminPaymentAudit)
      .filter((audit): audit is NonNullable<typeof audit> => audit !== null);
    const reconciliationRequired = row.manualReview || audits.length > 0;
    const refundEligibility = resolveBookingRefundEligibility({
      status: row.bookingStatus as BookingStatus,
      bookingDate: row.bookingDate,
      startTime: row.startTime,
      history: historyRows,
    });
    const displayName = row.userName?.trim() || `${row.firstName} ${row.lastName}`.trim();

    return {
      ...this.projectListItem(row),
      user: { id: row.userId, displayName },
      paymentMethod: row.paymentMethod,
      paymentType: row.paymentType,
      installments: row.installments,
      dateApproved: row.dateApproved,
      events,
      audits,
      reconciliation: {
        status: reconciliationRequired ? 'requires_attention' : 'no_flags',
        reasonCode: reconciliationRequired ? 'late_payment_requires_reconciliation' : null,
      },
      refundCapability: {
        status: 'unavailable',
        reasonCode: 'provider_refund_not_supported',
      },
      refundEligibility,
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
