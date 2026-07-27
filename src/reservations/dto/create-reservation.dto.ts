import {
  IsNotEmpty,
  IsString,
  IsUUID,
  IsOptional,
  IsDateString,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReservationDto {
  @ApiProperty({
    description: 'Court ID to reserve',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @IsNotEmpty()
  @IsUUID()
  courtId: string;

  @ApiProperty({
    description: 'Date of the booking in ISO format',
    example: '2024-01-15T00:00:00.000Z',
  })
  @IsNotEmpty()
  @IsDateString()
  bookingDate: string;

  @ApiProperty({
    description: 'Start time in HH:MM format',
    example: '14:00',
  })
  @IsNotEmpty()
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Start time must be in HH:MM format',
  })
  startTime: string;

  @ApiProperty({
    description: 'End time in HH:MM format',
    example: '16:00',
  })
  @IsNotEmpty()
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'End time must be in HH:MM format',
  })
  endTime: string;

  @ApiPropertyOptional({
    description: 'Optional notes for the reservation',
    example: 'Birthday party reservation',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
