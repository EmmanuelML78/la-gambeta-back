import { BookingStatus } from '../common/enums';
import {
  bookingCivilInstant,
  resolveBookingRefundEligibility,
} from './booking-refund-eligibility';

describe('booking refund eligibility', () => {
  const bookingDate = new Date('2026-09-10T00:00:00.000Z');

  it('interprets a booking civil time in Bogota without host timezone drift', () => {
    expect(bookingCivilInstant(bookingDate, '18:30').toISOString()).toBe(
      '2026-09-10T23:30:00.000Z',
    );
  });

  it.each([
    {
      label: 'grants a full refund for operational admin cancellation',
      status: BookingStatus.CANCELLED,
      reason: 'booking_cancelled_operational',
      cancelledAt: '2026-09-10T22:00:00.000Z',
      expected: ['eligible', 100, 'admin_operational_cancellation'],
    },
    {
      label: 'grants a full refund at the exact 24-hour boundary',
      status: BookingStatus.CANCELLED,
      reason: 'booking_cancelled',
      cancelledAt: '2026-09-09T23:30:00.000Z',
      expected: ['eligible', 100, 'cancelled_at_least_24_hours_before'],
    },
    {
      label: 'denies a refund inside 24 hours',
      status: BookingStatus.CANCELLED,
      reason: 'booking_cancelled',
      cancelledAt: '2026-09-09T23:30:00.001Z',
      expected: ['not_eligible', 0, 'cancelled_within_24_hours'],
    },
    {
      label: 'denies a refund for no-show',
      status: BookingStatus.NO_SHOW,
      reason: 'booking_no_show_player_absent',
      cancelledAt: '2026-09-11T00:00:00.000Z',
      expected: ['not_eligible', 0, 'no_show_not_refundable'],
    },
  ])('$label', ({ status, reason, cancelledAt, expected }) => {
    expect(
      resolveBookingRefundEligibility({
        status,
        bookingDate,
        startTime: '18:30',
        history: [
          {
            toStatus: status,
            reason,
            createdAt: new Date(cancelledAt),
          },
        ],
      }),
    ).toEqual({
      status: expected[0],
      percentage: expected[1],
      reasonCode: expected[2],
    });
  });
});
