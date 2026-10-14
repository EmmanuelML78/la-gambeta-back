import { BookingStatus, PaymentStatus } from '../../common/enums';
import type { BookingRefundEligibility } from '../../bookings/booking-refund-eligibility';
import type {
  AdminPaymentAuditProjection,
  AdminPaymentEventProjection,
} from '../admin-payment-evidence';

export interface AdminPaymentListItemDto {
  id: string;
  provider: string | null;
  status: PaymentStatus;
  amount: string;
  currency: string;
  refundedAmount: string | null;
  createdAt: Date;
  updatedAt: Date;
  booking: {
    id: string;
    status: BookingStatus;
    bookingDate: Date;
    startTime: string;
    endTime: string;
  };
  court: { id: string; name: string };
  venue: { id: string; name: string } | null;
}

export interface AdminPaymentPageDto {
  items: AdminPaymentListItemDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AdminPaymentSummaryDto {
  currency: 'COP';
  grossAmount: string;
  refundedAmount: string;
  netAmount: string;
  attemptCount: number;
  successfulCount: number;
  openCount: number;
  failedCount: number;
  refundedCount: number;
  reconciliationEventCount: number;
  statusCounts: Record<PaymentStatus, number>;
}

export interface AdminPaymentDetailDto extends AdminPaymentListItemDto {
  user: { id: string; displayName: string };
  paymentMethod: string | null;
  paymentType: string | null;
  installments: number | null;
  dateApproved: Date | null;
  events: AdminPaymentEventProjection[];
  audits: AdminPaymentAuditProjection[];
  reconciliation: {
    status: 'no_flags' | 'requires_attention';
    reasonCode: 'late_payment_requires_reconciliation' | 'provider_outcome_uncertain' | 'manual_review_required' | null;
  };
  refundCapability: {
    status: 'unavailable';
    reasonCode: 'provider_refund_not_supported';
  };
  refundEligibility: BookingRefundEligibility;
}
