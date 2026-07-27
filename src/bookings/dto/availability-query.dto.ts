import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AvailabilityQueryDto {
  @ApiProperty({
    description: 'Date to check availability in YYYY-MM-DD format',
    example: '2023-12-15',
  })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({
    description: 'Specific court ID to check (optional)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsOptional()
  courtId?: string;
}

export class TimeSlotDto {
  @ApiProperty({
    description: 'Start time of the slot',
    example: '14:00',
  })
  startTime: string;

  @ApiProperty({
    description: 'End time of the slot',
    example: '15:00',
  })
  endTime: string;

  @ApiProperty({
    description: 'Whether this slot is available',
    example: true,
  })
  available: boolean;

  @ApiProperty({
    description: 'Price for this time slot',
    example: '25000.00',
  })
  price: string;
}

export class CourtAvailabilityDto {
  @ApiProperty({
    description: 'Court ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  courtId: string;

  @ApiProperty({
    description: 'Court name',
    example: 'Cancha Principal',
  })
  courtName: string;

  @ApiProperty({
    description: 'Available time slots for this court',
    type: [TimeSlotDto],
  })
  timeSlots: TimeSlotDto[];
}
