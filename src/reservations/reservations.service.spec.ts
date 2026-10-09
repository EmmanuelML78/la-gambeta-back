import { BookingStatus, PaymentStatus, UserRole } from '../common/enums';
import { DrizzleService } from '../database/drizzle.service';
import { Booking } from '../database/schema';
import { BookingsService } from '../bookings/bookings.service';
import { PaymentsService } from '../payments/payments.service';
import { ReservationsService } from './reservations.service';

const BOOKING_ID = '123e4567-e89b-12d3-a456-426614174000';
const USER_ID = 'user-1';
const IDEMPOTENCY_KEY = 'reservation-key-0001';

const booking = {
  id: BOOKING_ID,
  userId: USER_ID,
  totalPrice: '90000.00',
} as Booking;

describe('ReservationsService checkout compatibility', () => {
  it('forwards booking, current identity, and idempotency key without client price fields', async () => {
    const paymentsService = {
      createPreference: jest.fn().mockResolvedValue({
        paymentAttemptId: '223e4567-e89b-12d3-a456-426614174000',
        preferenceId: 'preference-1',
        initPoint: 'https://checkout.test/1',
        sandboxInitPoint: 'https://checkout.test/1',
      }),
    };
    const bookingsService = {
      create: jest.fn().mockResolvedValue(booking),
    };
    const service = new ReservationsService(
      {} as DrizzleService,
      paymentsService as unknown as PaymentsService,
      bookingsService as unknown as BookingsService,
    );
    jest.spyOn(service, 'getBookingById').mockResolvedValue(booking);

    await service.createReservation(
      USER_ID,
      UserRole.USER,
      {
        courtId: '323e4567-e89b-12d3-a456-426614174000',
        bookingDate: '2026-10-20',
        startTime: '10:00',
        endTime: '11:00',
      },
      IDEMPOTENCY_KEY,
    );

    expect(paymentsService.createPreference).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: BOOKING_ID }),
      USER_ID,
      UserRole.USER,
      IDEMPOTENCY_KEY,
    );
    const preferenceInput = paymentsService.createPreference.mock.calls[0][0];
    expect(preferenceInput).not.toHaveProperty('amount');
    expect(preferenceInput).not.toHaveProperty('currency');
  });

  it('does not confirm a cancelled booking even when a late payment succeeded', async () => {
    const tx = {
      select: jest.fn(() => ({
        from: () => ({ where: () => ({ limit: () => ({ for: async () => [{
          ...booking,
          status: BookingStatus.CANCELLED,
        }] }) }) }),
      })),
      update: jest.fn(),
    };
    const drizzle = {
      transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)),
    };
    const paymentsService = {
      getPaymentByBookingId: jest.fn().mockResolvedValue({ status: PaymentStatus.SUCCEEDED }),
    };
    const service = new ReservationsService(
      { db: drizzle } as unknown as DrizzleService,
      paymentsService as unknown as PaymentsService,
      {} as BookingsService,
    );
    jest.spyOn(service, 'getBookingById').mockResolvedValue({
      ...booking,
      status: BookingStatus.CANCELLED,
    });

    await expect(service.confirmReservation(BOOKING_ID, USER_ID)).rejects.toThrow(
      'Booking cannot be confirmed in its current status',
    );
    expect(tx.update).not.toHaveBeenCalled();
  });
});
