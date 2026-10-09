import { inArray, sql } from 'drizzle-orm';
import { PaymentStatus } from '../common/enums';
import { payments } from '../database/schema';

export const FINANCIAL_PAYMENT_STATUSES = [
  PaymentStatus.SUCCEEDED,
  PaymentStatus.COMPLETED,
  PaymentStatus.PARTIALLY_REFUNDED,
  PaymentStatus.REFUNDED,
] as const;

export const OPEN_PAYMENT_STATUSES = [
  PaymentStatus.PENDING,
  PaymentStatus.PROCESSING,
] as const;

export const FAILED_PAYMENT_STATUSES = [
  PaymentStatus.FAILED,
  PaymentStatus.CANCELLED,
] as const;

export const REFUNDED_PAYMENT_STATUSES = [
  PaymentStatus.PARTIALLY_REFUNDED,
  PaymentStatus.REFUNDED,
] as const;

export function buildPaymentFinancialSummarySelection() {
  const gross = sql`coalesce(sum(case when ${inArray(payments.status, [...FINANCIAL_PAYMENT_STATUSES])} then ${payments.amount} else 0 end), 0)`;
  const refunded = sql`coalesce(sum(case when ${inArray(payments.status, [...REFUNDED_PAYMENT_STATUSES])} then coalesce(${payments.refundedAmount}, 0) else 0 end), 0)`;

  return {
    grossAmount: sql<string>`${gross}::text`,
    refundedAmount: sql<string>`${refunded}::text`,
    netAmount: sql<string>`(${gross} - ${refunded})::text`,
    attemptCount: sql<number>`count(*)::int`,
    successfulCount: sql<number>`count(*) filter (where ${inArray(payments.status, [...FINANCIAL_PAYMENT_STATUSES])})::int`,
    openCount: sql<number>`count(*) filter (where ${inArray(payments.status, [...OPEN_PAYMENT_STATUSES])})::int`,
    failedCount: sql<number>`count(*) filter (where ${inArray(payments.status, [...FAILED_PAYMENT_STATUSES])})::int`,
    refundedCount: sql<number>`count(*) filter (where ${inArray(payments.status, [...REFUNDED_PAYMENT_STATUSES])})::int`,
  };
}
