import { BookingStatus } from '../common/enums';
import {
  bogotaCivilInstant,
  civilDateFromStoredValue,
} from './booking-civil-time';

export const REFUND_NOTICE_HOURS = 24;

export type RefundEligibilityReasonCode =
  | 'admin_operational_cancellation'
  | 'cancelled_at_least_24_hours_before'
  | 'cancelled_within_24_hours'
  | 'no_show_not_refundable'
  | 'booking_not_cancelled'
  | 'cancellation_time_unavailable';

export interface BookingRefundEligibility {
  status: 'eligible' | 'not_eligible' | 'not_applicable';
  percentage: 0 | 100;
  reasonCode: RefundEligibilityReasonCode;
}

export interface BookingStatusHistoryForRefund {
  toStatus: BookingStatus;
  reason: string | null;
  createdAt: Date;
}

export const bookingCivilInstant = (bookingDate: Date | string, time: string) =>
  bogotaCivilInstant(civilDateFromStoredValue(bookingDate), time);

export function resolveBookingRefundEligibility(input: {
  status: BookingStatus;
  bookingDate: Date | string;
  startTime: string;
  history: readonly BookingStatusHistoryForRefund[];
}): BookingRefundEligibility {
  if (input.status === BookingStatus.NO_SHOW) {
    return {
      status: 'not_eligible',
      percentage: 0,
      reasonCode: 'no_show_not_refundable',
    };
  }
  if (input.status !== BookingStatus.CANCELLED) {
    return {
      status: 'not_applicable',
      percentage: 0,
      reasonCode: 'booking_not_cancelled',
    };
  }

  const cancellation = [...input.history]
    .reverse()
    .find((event) => event.toStatus === BookingStatus.CANCELLED);
  if (!cancellation) {
    return {
      status: 'not_eligible',
      percentage: 0,
      reasonCode: 'cancellation_time_unavailable',
    };
  }
  if (cancellation.reason === 'booking_cancelled_operational') {
    return {
      status: 'eligible',
      percentage: 100,
      reasonCode: 'admin_operational_cancellation',
    };
  }

  const startsAt = bookingCivilInstant(input.bookingDate, input.startTime);
  const noticeHours =
    (startsAt.getTime() - cancellation.createdAt.getTime()) / 3_600_000;
  return noticeHours >= REFUND_NOTICE_HOURS
    ? {
        status: 'eligible',
        percentage: 100,
        reasonCode: 'cancelled_at_least_24_hours_before',
      }
    : {
        status: 'not_eligible',
        percentage: 0,
        reasonCode: 'cancelled_within_24_hours',
      };
}
