import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  ParseEnumPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { BookingsService } from './bookings.service';
import {
  CreateBookingDto,
  UpdateBookingDto,
  UpdateBookingStatusDto,
  BookingResponseDto,
  AvailabilityQueryDto,
  CourtAvailabilityDto,
  AdminBookingQueryDto,
  AdminBookingPageDto,
} from './dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { UserRole, BookingStatus } from '../common/enums';
import { User } from '../database/schema';

@ApiTags('Bookings')
@ApiBearerAuth()
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Create a booking manually (Admin only)',
    description:
      'Los usuarios reservan por POST /reservations (pay-first). Este endpoint ' +
      'es para carga manual del staff, sin pago.',
  })
  @ApiResponse({
    status: 201,
    description: 'The booking has been successfully created.',
    type: BookingResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Court not found or inactive.',
  })
  @ApiResponse({
    status: 409,
    description: 'Time slot is not available.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid booking data.',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized.',
  })
  async create(
    @Body() createBookingDto: CreateBookingDto,
    @CurrentUser() user: User,
  ): Promise<BookingResponseDto> {
    return this.bookingsService.create(createBookingDto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get bookings (filtered by user or all for admin)' })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter bookings by status',
    enum: BookingStatus,
  })
  @ApiResponse({
    status: 200,
    description: 'List of bookings retrieved successfully.',
    type: [BookingResponseDto],
  })
  async findAll(
    @Query('status', new ParseEnumPipe(BookingStatus, { optional: true }))
    status?: BookingStatus,
    @CurrentUser() user?: User,
  ): Promise<BookingResponseDto[]> {
    // Non-admin users can only see their own bookings
    const userId = user?.role === UserRole.ADMIN ? undefined : user?.id;
    return this.bookingsService.findAll(userId, status);
  }

  @Get('my-bookings')
  @ApiOperation({ summary: 'Get current user bookings' })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter bookings by status',
    enum: BookingStatus,
  })
  @ApiResponse({
    status: 200,
    description: 'List of user bookings retrieved successfully.',
    type: [BookingResponseDto],
  })
  async findMyBookings(
    @Query('status', new ParseEnumPipe(BookingStatus, { optional: true }))
    status?: BookingStatus,
    @CurrentUser() user?: User,
  ): Promise<BookingResponseDto[]> {
    return this.bookingsService.findAll(user?.id, status);
  }

  @Get('availability')
  @Public()
  @ApiOperation({ summary: 'Check court availability for a specific date' })
  @ApiResponse({
    status: 200,
    description: 'Availability information retrieved successfully.',
    type: [CourtAvailabilityDto],
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid date format.',
  })
  async checkAvailability(
    @Query() query: AvailabilityQueryDto,
  ): Promise<CourtAvailabilityDto[]> {
    return this.bookingsService.getAvailability(query);
  }

  @Get('admin')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get a paginated booking list (Admin only)' })
  @ApiResponse({ status: 200, type: AdminBookingPageDto })
  @ApiResponse({ status: 403, description: 'Forbidden. Admin role required.' })
  async findAllAdminPaginated(
    @Query() query: AdminBookingQueryDto,
  ): Promise<AdminBookingPageDto> {
    return this.bookingsService.findAllAdminPaginated(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a booking by ID' })
  @ApiParam({
    name: 'id',
    description: 'Booking ID',
    type: 'string',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Booking retrieved successfully.',
    type: BookingResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Booking not found.',
  })
  @ApiResponse({
    status: 403,
    description: 'You can only access your own bookings.',
  })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: User,
  ): Promise<BookingResponseDto> {
    return this.bookingsService.findOne(id, user?.id, user?.role);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a booking' })
  @ApiParam({
    name: 'id',
    description: 'Booking ID',
    type: 'string',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'The booking has been successfully updated.',
    type: BookingResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Booking not found.',
  })
  @ApiResponse({
    status: 403,
    description: 'You can only update your own bookings.',
  })
  @ApiResponse({
    status: 409,
    description: 'Time slot is not available.',
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateBookingDto: UpdateBookingDto,
    @CurrentUser() user?: User,
  ): Promise<BookingResponseDto> {
    return this.bookingsService.update(
      id,
      updateBookingDto,
      user?.id,
      user?.role,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel a booking' })
  @ApiParam({
    name: 'id',
    description: 'Booking ID',
    type: 'string',
    format: 'uuid',
  })
  @ApiResponse({
    status: 204,
    description: 'The booking has been successfully cancelled.',
  })
  @ApiResponse({
    status: 404,
    description: 'Booking not found.',
  })
  @ApiResponse({
    status: 403,
    description: 'You can only cancel your own bookings.',
  })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: User,
  ): Promise<void> {
    return this.bookingsService.remove(id, user?.id, user?.role);
  }

  // Admin-only endpoints
  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update booking status (Admin only)' })
  @ApiParam({
    name: 'id',
    description: 'Booking ID',
    type: 'string',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Booking status updated successfully.',
    type: BookingResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Booking not found.',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden. Admin role required.',
  })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateBookingStatusDto,
  ): Promise<BookingResponseDto> {
    return this.bookingsService.updateStatus(id, body.status);
  }

  @Get('admin/all')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all bookings with full details (Admin only)' })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter bookings by status',
    enum: BookingStatus,
  })
  @ApiResponse({
    status: 200,
    description: 'All bookings retrieved successfully.',
    type: [BookingResponseDto],
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden. Admin role required.',
  })
  async findAllAdmin(
    @Query('status', new ParseEnumPipe(BookingStatus, { optional: true }))
    status?: BookingStatus,
  ): Promise<BookingResponseDto[]> {
    return this.bookingsService.findAll(undefined, status);
  }
}
