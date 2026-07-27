import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { eq, and, or, desc, SQL } from 'drizzle-orm';
import { DrizzleService } from '../database/drizzle.service';
import {
  bookings,
  courts,
  users,
  Booking,
  NewBooking,
  Court,
} from '../database/schema';
import {
  CreateBookingDto,
  UpdateBookingDto,
  BookingResponseDto,
  AvailabilityQueryDto,
  CourtAvailabilityDto,
  TimeSlotDto,
} from './dto';
import { BookingStatus, UserRole } from '../common/enums';
import { CourtResponseDto } from '../courts/dto';

@Injectable()
export class BookingsService {
  constructor(private readonly drizzle: DrizzleService) {}

  async create(
    createBookingDto: CreateBookingDto,
    userId: string,
  ): Promise<BookingResponseDto> {
    // Verify court exists and is active
    const [court] = await this.drizzle.db
      .select()
      .from(courts)
      .where(
        and(eq(courts.id, createBookingDto.courtId), eq(courts.isActive, true)),
      )
      .limit(1);

    if (!court) {
      throw new NotFoundException('Court not found or inactive');
    }

    // Validate booking time
    this.validateBookingTime(createBookingDto, court);

    // Check if slot is available
    const isAvailable = await this.isTimeSlotAvailable(
      createBookingDto.courtId,
      createBookingDto.bookingDate,
      createBookingDto.startTime,
      createBookingDto.endTime,
    );

    if (!isAvailable) {
      throw new ConflictException('Time slot is not available');
    }

    // Calculate total price
    const totalPrice = this.calculatePrice(
      court.pricePerHour,
      createBookingDto.startTime,
      createBookingDto.endTime,
    );

    const newBooking: NewBooking = {
      userId,
      courtId: createBookingDto.courtId,
      bookingDate: new Date(createBookingDto.bookingDate),
      startTime: createBookingDto.startTime,
      endTime: createBookingDto.endTime,
      totalPrice: totalPrice.toString(),
      notes: createBookingDto.notes,
      status: BookingStatus.PENDING,
    };

    return this.guardOverlap(async () => {
      const [createdBooking] = await this.drizzle.db
        .insert(bookings)
        .values(newBooking)
        .returning();
      return this.mapToResponseDto(createdBooking);
    });
  }

  /**
   * Traduce la violación del EXCLUDE constraint (SQLSTATE 23P01) a un 409.
   * Es la red final: aunque el check-then-insert de la app tenga una carrera,
   * Postgres rechaza el solapamiento de forma atómica.
   */
  private async guardOverlap<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (err) {
      if ((err as { code?: string })?.code === '23P01') {
        throw new ConflictException('Time slot is not available');
      }
      throw err;
    }
  }

  async findAll(
    userId?: string,
    status?: BookingStatus,
  ): Promise<BookingResponseDto[]> {
    const whereConditions: SQL[] = [];
    if (userId) {
      whereConditions.push(eq(bookings.userId, userId));
    }
    if (status) {
      whereConditions.push(eq(bookings.status, status));
    }

    const query = this.drizzle.db
      .select({
        booking: bookings,
        user: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
        },
        court: courts,
      })
      .from(bookings)
      .leftJoin(users, eq(bookings.userId, users.id))
      .leftJoin(courts, eq(bookings.courtId, courts.id))
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined);

    const results = await query.orderBy(desc(bookings.createdAt));

    return results.map((result) => ({
      ...this.mapToResponseDto(result.booking),
      user: result.user || undefined,
      court: result.court
        ? this.mapCourtToResponseDto(result.court)
        : undefined,
    }));
  }

  async findOne(
    id: string,
    userId?: string,
    userRole?: UserRole,
  ): Promise<BookingResponseDto> {
    const [result] = await this.drizzle.db
      .select({
        booking: bookings,
        user: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
        },
        court: courts,
      })
      .from(bookings)
      .leftJoin(users, eq(bookings.userId, users.id))
      .leftJoin(courts, eq(bookings.courtId, courts.id))
      .where(eq(bookings.id, id))
      .limit(1);

    if (!result) {
      throw new NotFoundException(`Booking with ID ${id} not found`);
    }

    // Check if user can access this booking
    if (
      userId &&
      userRole !== UserRole.ADMIN &&
      result.booking.userId !== userId
    ) {
      throw new ForbiddenException('You can only access your own bookings');
    }

    return {
      ...this.mapToResponseDto(result.booking),
      user: result.user || undefined,
      court: result.court
        ? this.mapCourtToResponseDto(result.court)
        : undefined,
    };
  }

  async update(
    id: string,
    updateBookingDto: UpdateBookingDto,
    userId?: string,
    userRole?: UserRole,
  ): Promise<BookingResponseDto> {
    // Find existing booking
    const existingBooking = await this.findOne(id, userId, userRole);

    // Only allow updates if user owns the booking or is admin
    if (
      userId &&
      userRole !== UserRole.ADMIN &&
      existingBooking.userId !== userId
    ) {
      throw new ForbiddenException('You can only update your own bookings');
    }

    // If updating time or date, validate availability
    if (
      updateBookingDto.bookingDate ||
      updateBookingDto.startTime ||
      updateBookingDto.endTime
    ) {
      const courtId = existingBooking.courtId;
      const bookingDate =
        updateBookingDto.bookingDate ||
        existingBooking.bookingDate.toISOString().split('T')[0];
      const startTime = updateBookingDto.startTime || existingBooking.startTime;
      const endTime = updateBookingDto.endTime || existingBooking.endTime;

      // Get court for validation
      const [court] = await this.drizzle.db
        .select()
        .from(courts)
        .where(eq(courts.id, courtId))
        .limit(1);

      if (court) {
        this.validateBookingTime(
          {
            courtId,
            bookingDate,
            startTime,
            endTime,
          },
          court,
        );

        // Check availability (excluding current booking)
        const isAvailable = await this.isTimeSlotAvailable(
          courtId,
          bookingDate,
          startTime,
          endTime,
          id,
        );

        if (!isAvailable) {
          throw new ConflictException('Time slot is not available');
        }

        // Recalculate price if time changed
        if (updateBookingDto.startTime || updateBookingDto.endTime) {
          const totalPrice = this.calculatePrice(
            court.pricePerHour,
            startTime,
            endTime,
          );
          updateBookingDto = {
            ...updateBookingDto,
            totalPrice: totalPrice.toString(),
          } as UpdateBookingDto & { totalPrice: string };
        }
      }
    }

    return this.guardOverlap(async () => {
      const [updatedBooking] = await this.drizzle.db
        .update(bookings)
        .set({
          ...updateBookingDto,
          bookingDate: updateBookingDto.bookingDate
            ? new Date(updateBookingDto.bookingDate)
            : undefined,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, id))
        .returning();

      return this.mapToResponseDto(updatedBooking);
    });
  }

  /**
   * Cambio de estado reservado a admins (endpoint dedicado).
   * Separado del update público para que un usuario no pueda auto-confirmar
   * su reserva sin pagar.
   */
  async updateStatus(
    id: string,
    status: BookingStatus,
  ): Promise<BookingResponseDto> {
    return this.guardOverlap(async () => {
      const [updated] = await this.drizzle.db
        .update(bookings)
        .set({ status, updatedAt: new Date() })
        .where(eq(bookings.id, id))
        .returning();

      if (!updated) {
        throw new NotFoundException(`Booking with ID ${id} not found`);
      }
      return this.mapToResponseDto(updated);
    });
  }

  async remove(
    id: string,
    userId?: string,
    userRole?: UserRole,
  ): Promise<void> {
    const existingBooking = await this.findOne(id, userId, userRole);

    // Only allow cancellation if user owns the booking or is admin
    if (
      userId &&
      userRole !== UserRole.ADMIN &&
      existingBooking.userId !== userId
    ) {
      throw new ForbiddenException('You can only cancel your own bookings');
    }

    // Cancel the booking instead of deleting
    await this.drizzle.db
      .update(bookings)
      .set({
        status: BookingStatus.CANCELLED,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, id));
  }

  async getAvailability(
    query: AvailabilityQueryDto,
  ): Promise<CourtAvailabilityDto[]> {
    // Get active courts (filter by courtId if provided)
    const whereConditions: SQL[] = [eq(courts.isActive, true)];

    if (query.courtId) {
      whereConditions.push(eq(courts.id, query.courtId));
    }

    const availableCourts = await this.drizzle.db
      .select()
      .from(courts)
      .where(and(...whereConditions));

    const availability: CourtAvailabilityDto[] = [];

    for (const court of availableCourts) {
      const timeSlots = await this.getTimeSlots(court, query.date);
      availability.push({
        courtId: court.id,
        courtName: court.name,
        timeSlots,
      });
    }

    return availability;
  }

  private validateBookingTime(
    bookingData: {
      courtId: string;
      bookingDate: string;
      startTime: string;
      endTime: string;
    },
    court: Court,
  ): void {
    const { bookingDate, startTime, endTime } = bookingData;

    // Validate that end time is after start time
    const startMinutes = this.timeToMinutes(startTime);
    const endMinutes = this.timeToMinutes(endTime);

    if (endMinutes <= startMinutes) {
      throw new BadRequestException('End time must be after start time');
    }

    // Validate minimum booking duration (1 hour)
    const durationMinutes = endMinutes - startMinutes;
    if (durationMinutes < 60) {
      throw new BadRequestException('Minimum booking duration is 1 hour');
    }

    // Validate against court operating hours
    const courtOpenMinutes = this.timeToMinutes(court.openingTime);
    const courtCloseMinutes = this.timeToMinutes(court.closingTime);

    if (startMinutes < courtOpenMinutes || endMinutes > courtCloseMinutes) {
      throw new BadRequestException(
        `Court is only available from ${court.openingTime} to ${court.closingTime}`,
      );
    }

    // Validate day of week
    const bookingDay = new Date(bookingDate).getDay(); // 0=Sunday, 1=Monday, etc.
    const dayOfWeek = bookingDay === 0 ? 7 : bookingDay; // Convert to 1=Monday, 7=Sunday
    const availableDays = court.availableDays
      .split(',')
      .map((d) => parseInt(d));

    if (!availableDays.includes(dayOfWeek)) {
      throw new BadRequestException('Court is not available on this day');
    }

    // Validate booking is not in the past
    const bookingDateTime = new Date(`${bookingDate}T${startTime}`);
    const now = new Date();

    if (bookingDateTime <= now) {
      throw new BadRequestException('Cannot book in the past');
    }
  }

  private async isTimeSlotAvailable(
    courtId: string,
    bookingDate: string,
    startTime: string,
    endTime: string,
    excludeBookingId?: string,
  ): Promise<boolean> {
    const startMinutes = this.timeToMinutes(startTime);
    const endMinutes = this.timeToMinutes(endTime);

    const whereConditions: SQL[] = [
      eq(bookings.courtId, courtId),
      eq(bookings.bookingDate, new Date(bookingDate)),
      or(
        eq(bookings.status, BookingStatus.PENDING),
        eq(bookings.status, BookingStatus.CONFIRMED),
        eq(bookings.status, BookingStatus.ACTIVE),
      )!,
    ];

    const existingBookings = await this.drizzle.db
      .select()
      .from(bookings)
      .where(and(...whereConditions));

    // Check for overlaps
    for (const booking of existingBookings) {
      if (excludeBookingId && booking.id === excludeBookingId) {
        continue;
      }

      const bookingStart = this.timeToMinutes(booking.startTime);
      const bookingEnd = this.timeToMinutes(booking.endTime);

      // Check if there's any overlap
      if (startMinutes < bookingEnd && endMinutes > bookingStart) {
        return false;
      }
    }

    return true;
  }

  private async getTimeSlots(
    court: Court,
    date: string,
  ): Promise<TimeSlotDto[]> {
    const slots: TimeSlotDto[] = [];
    const courtOpenMinutes = this.timeToMinutes(court.openingTime);
    const courtCloseMinutes = this.timeToMinutes(court.closingTime);

    // Generate hourly slots
    for (
      let minutes = courtOpenMinutes;
      minutes < courtCloseMinutes;
      minutes += 60
    ) {
      const startTime = this.minutesToTime(minutes);
      const endTime = this.minutesToTime(minutes + 60);

      const available = await this.isTimeSlotAvailable(
        court.id,
        date,
        startTime,
        endTime,
      );

      slots.push({
        startTime,
        endTime,
        available,
        price: court.pricePerHour,
      });
    }

    return slots;
  }

  private calculatePrice(
    pricePerHour: string,
    startTime: string,
    endTime: string,
  ): number {
    const startMinutes = this.timeToMinutes(startTime);
    const endMinutes = this.timeToMinutes(endTime);
    const durationHours = (endMinutes - startMinutes) / 60;
    return parseFloat(pricePerHour) * durationHours;
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  private mapToResponseDto(booking: Booking): BookingResponseDto {
    return {
      id: booking.id,
      userId: booking.userId,
      courtId: booking.courtId,
      bookingDate: booking.bookingDate,
      startTime: booking.startTime,
      endTime: booking.endTime,
      status: booking.status,
      totalPrice: booking.totalPrice,
      notes: booking.notes ?? undefined,
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
    };
  }

  private mapCourtToResponseDto(court: Court): CourtResponseDto {
    return {
      id: court.id,
      name: court.name,
      description: court.description,
      imageUrl: court.imageUrl,
      pricePerHour: court.pricePerHour,
      type: court.type,
      surface: court.surface,
      minPlayers: court.minPlayers,
      maxPlayers: court.maxPlayers,
      openingTime: court.openingTime,
      closingTime: court.closingTime,
      availableDays: court.availableDays,
      isActive: court.isActive,
      createdAt: court.createdAt,
      updatedAt: court.updatedAt,
    };
  }
}
