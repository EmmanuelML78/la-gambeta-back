import { UserRole } from '../common/enums';
import { User } from '../database/schema';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

describe('ReservationsController idempotency forwarding', () => {
  it('passes current user identity and Idempotency-Key to the reservation service', async () => {
    const reservationsService = {
      createReservation: jest.fn().mockResolvedValue({
        booking: { id: 'booking-1' },
        preference: { preferenceId: 'preference-1' },
      }),
    };
    const controller = new ReservationsController(
      reservationsService as unknown as ReservationsService,
    );
    const user = { id: 'user-1', role: UserRole.USER } as User;
    const dto = {
      courtId: '323e4567-e89b-12d3-a456-426614174000',
      bookingDate: '2026-10-20',
      startTime: '10:00',
      endTime: '11:00',
    };

    await controller.createReservation(dto, user, 'reservation-key-0001');

    expect(reservationsService.createReservation).toHaveBeenCalledWith(
      user.id,
      user.role,
      dto,
      'reservation-key-0001',
    );
  });
});
