import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Param,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../database/schema';

@ApiTags('reservations')
@Controller('reservations')
@ApiBearerAuth()
export class ReservationsController {
  private readonly logger = new Logger(ReservationsController.name);

  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new reservation' })
  @ApiResponse({
    status: 201,
    description: 'Reservation created successfully with MercadoPago preference',
    schema: {
      type: 'object',
      properties: {
        booking: { type: 'object' },
        preference: {
          type: 'object',
          properties: {
            preferenceId: { type: 'string' },
            initPoint: { type: 'string' },
            sandboxInitPoint: { type: 'string' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid data or time slot unavailable',
  })
  @ApiResponse({ status: 404, description: 'Court not found' })
  async createReservation(
    @Body() createReservationDto: CreateReservationDto,
    @CurrentUser() user: User,
  ) {
    this.logger.log(
      `Creating reservation for user: ${user.id}, court: ${createReservationDto.courtId}`,
    );

    return await this.reservationsService.createReservation(
      user.id,
      createReservationDto,
    );
  }

  @Put(':bookingId/confirm')
  @ApiOperation({ summary: 'Confirm a reservation after successful payment' })
  @ApiResponse({
    status: 200,
    description: 'Reservation confirmed successfully',
  })
  @ApiResponse({
    status: 400,
    description:
      'Bad request - MercadoPago payment not completed or booking cannot be confirmed',
  })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  async confirmReservation(
    @Param('bookingId') bookingId: string,
    @CurrentUser() user: User,
  ) {
    this.logger.log(
      `Confirming reservation: ${bookingId} for user: ${user.id}`,
    );

    const booking = await this.reservationsService.confirmReservation(
      bookingId,
      user.id,
    );
    return { booking };
  }

  @Put(':bookingId/cancel')
  @ApiOperation({ summary: 'Cancel a reservation' })
  @ApiResponse({
    status: 200,
    description: 'Reservation cancelled successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - booking cannot be cancelled',
  })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  async cancelReservation(
    @Param('bookingId') bookingId: string,
    @CurrentUser() user: User,
  ) {
    this.logger.log(
      `Cancelling reservation: ${bookingId} for user: ${user.id}`,
    );

    const booking = await this.reservationsService.cancelReservation(
      bookingId,
      user.id,
    );
    return { booking };
  }

  @Get()
  @ApiOperation({ summary: 'Get all user reservations' })
  @ApiResponse({
    status: 200,
    description: 'User reservations retrieved successfully',
  })
  async getUserReservations(@CurrentUser() user: User) {
    this.logger.log(`Getting reservations for user: ${user.id}`);

    const bookings = await this.reservationsService.getUserReservations(
      user.id,
    );
    return { bookings };
  }

  @Get(':bookingId')
  @ApiOperation({ summary: 'Get reservation details with payment info' })
  @ApiResponse({
    status: 200,
    description: 'Reservation details retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  async getReservation(
    @Param('bookingId') bookingId: string,
    @CurrentUser() user: User,
  ) {
    this.logger.log(`Getting reservation: ${bookingId} for user: ${user.id}`);

    const result =
      await this.reservationsService.getBookingWithPayment(bookingId);

    if (!result || result.booking.userId !== user.id) {
      return { booking: null, payment: null };
    }

    return result;
  }
}
