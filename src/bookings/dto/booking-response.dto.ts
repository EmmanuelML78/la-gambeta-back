import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingStatus } from '../../common/enums';
import { CourtResponseDto } from '../../courts/dto';

export class UserSummaryDto {
  @ApiProperty({
    description: 'User ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'User email',
    example: 'user@example.com',
  })
  email: string;

  @ApiProperty({
    description: 'User first name',
    example: 'John',
  })
  firstName: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
  })
  lastName: string;
}

export class BookingResponseDto {
  @ApiProperty({
    description: 'Unique identifier of the booking',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'User ID who made the booking',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  userId: string;

  @ApiProperty({
    description: 'Court ID being booked',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  courtId: string;

  @ApiProperty({
    description: 'Booking date',
    example: '2023-12-15T00:00:00.000Z',
  })
  bookingDate: Date;

  @ApiProperty({
    description: 'Start time in HH:MM format',
    example: '14:00',
  })
  startTime: string;

  @ApiProperty({
    description: 'End time in HH:MM format',
    example: '15:00',
  })
  endTime: string;

  @ApiProperty({
    description: 'Status of the booking',
    enum: BookingStatus,
    example: BookingStatus.PENDING,
  })
  status: BookingStatus;

  @ApiProperty({
    description: 'Total price for the booking',
    example: '25000.00',
  })
  totalPrice: string;

  @ApiPropertyOptional({
    description: 'Additional notes for the booking',
    example: 'Birthday party reservation',
  })
  notes?: string | null;

  @ApiProperty({
    description: 'Creation date',
    example: '2023-12-01T10:00:00Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last update date',
    example: '2023-12-01T10:00:00Z',
  })
  updatedAt: Date;

  @ApiPropertyOptional({
    description: 'User information (included when requested)',
    type: UserSummaryDto,
  })
  user?: UserSummaryDto;

  @ApiPropertyOptional({
    description: 'Court information (included when requested)',
    type: CourtResponseDto,
  })
  court?: CourtResponseDto;
}
