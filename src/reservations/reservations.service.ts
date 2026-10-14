import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DrizzleService } from '../database/drizzle.service';
import { bookings, Booking } from '../database/schema';
import { BookingStatus, PaymentStatus, UserRole } from '../common/enums';
import { PaymentsService } from '../payments/payments.service';
import { BookingsService } from '../bookings/bookings.service';
import { CreateReservationDto } from './dto';

/**
 * Orquestador del flujo pay-first de reservas.
 *
 * NO reimplementa validación ni disponibilidad: delega en BookingsService
 * (única autoridad del dominio). Acá solo se agrega la capa de pago.
 */
@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(
    private readonly drizzleService: DrizzleService,
    private readonly paymentsService: PaymentsService,
    private readonly bookingsService: BookingsService,
  ) {}

  async createReservation(
    userId: string,
    userRole: UserRole,
    dto: CreateReservationDto,
    idempotencyKey: string | undefined,
  ): Promise<{
    booking: Booking;
      preference: {
        paymentAttemptId: string;
      preferenceId: string;
      initPoint: string;
      sandboxInitPoint: string;
    };
  }> {
    // Creación + validación (horario/día/pasado) + disponibilidad correcta:
    // todo lo resuelve la autoridad del dominio, con UNA sola regla.
    const created = await this.bookingsService.create(
      {
        courtId: dto.courtId,
        bookingDate: dto.bookingDate,
        startTime: dto.startTime,
        endTime: dto.endTime,
        notes: dto.notes,
      },
      userId,
    );

    try {
      const preference = await this.paymentsService.createPreference(
        {
          bookingId: created.id,
          description: `Reserva ${dto.bookingDate} ${dto.startTime}-${dto.endTime}`,
        },
        userId,
        userRole,
        idempotencyKey,
      );

      const booking = await this.getBookingById(created.id);
      this.logger.log(`Reservation created: ${created.id} for user: ${userId}`);
      return { booking: booking!, preference };
    } catch (error) {
      // Rollback suave: cancelar libera el turno (CANCELLED no bloquea disponibilidad).
      await this.bookingsService.updateStatus(
        created.id,
        BookingStatus.CANCELLED,
      );
      throw error;
    }
  }

  /**
   * Confirmación idempotente. El webhook ya activa la reserva al aprobarse el
   * pago; este endpoint solo re-verifica (por si el front confirma a mano).
   */
  async confirmReservation(
    bookingId: string,
    userId: string,
  ): Promise<Booking> {
    const booking = await this.getBookingById(bookingId);
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    if (booking.userId !== userId) {
      throw new ForbiddenException('Unauthorized to confirm this booking');
    }
    if (booking.status === BookingStatus.ACTIVE) return booking;

    const payment = await this.paymentsService.getPaymentByBookingId(bookingId);
    if (!payment || payment.status !== PaymentStatus.SUCCEEDED) {
      throw new BadRequestException('Payment not completed');
    }

    const payableStates = [
      BookingStatus.DRAFT,
      BookingStatus.CONFIRMED,
      BookingStatus.PENDING,
      BookingStatus.PROCESSING,
    ];
    const updated = await this.drizzleService.db.transaction(async (tx) => {
      const [lockedBooking] = await tx
        .select()
        .from(bookings)
        .where(eq(bookings.id, bookingId))
        .limit(1)
        .for('update');
      if (!lockedBooking) throw new NotFoundException('Booking not found');
      if (lockedBooking.userId !== userId) {
        throw new ForbiddenException('Unauthorized to confirm this booking');
      }
      if (lockedBooking.status === BookingStatus.ACTIVE) return lockedBooking;
      if (!payableStates.includes(lockedBooking.status)) {
        throw new BadRequestException(
          'Booking cannot be confirmed in its current status',
        );
      }
      const [confirmed] = await tx
        .update(bookings)
        .set({ status: BookingStatus.ACTIVE, updatedAt: new Date() })
        .where(eq(bookings.id, bookingId))
        .returning();
      return confirmed;
    });

    this.logger.log(`Reservation confirmed: ${bookingId}`);
    return updated;
  }

  async cancelReservation(bookingId: string, userId: string): Promise<Booking> {
    const booking = await this.getBookingById(bookingId);
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    if (booking.userId !== userId) {
      throw new ForbiddenException('Unauthorized to cancel this booking');
    }
    if (
      booking.status === BookingStatus.CANCELLED ||
      booking.status === BookingStatus.FINISHED
    ) {
      throw new BadRequestException(
        'Booking cannot be cancelled in its current status',
      );
    }

    const [updated] = await this.drizzleService.db
      .update(bookings)
      .set({ status: BookingStatus.CANCELLED, updatedAt: new Date() })
      .where(eq(bookings.id, bookingId))
      .returning();

    this.logger.log(`Reservation cancelled: ${bookingId}`);
    return updated;
  }

  async getUserReservations(userId: string): Promise<Booking[]> {
    return this.drizzleService.db
      .select()
      .from(bookings)
      .where(eq(bookings.userId, userId))
      .orderBy(bookings.bookingDate);
  }

  async getBookingById(bookingId: string): Promise<Booking | null> {
    const result = await this.drizzleService.db
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);
    return result[0] || null;
  }

  async getBookingWithPayment(bookingId: string) {
    const booking = await this.getBookingById(bookingId);
    if (!booking) return null;

    const payment = await this.paymentsService.getPaymentByBookingId(bookingId);
    return { booking, payment };
  }
}
