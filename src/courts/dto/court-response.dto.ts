import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CourtType, CourtSurface } from '../../common/enums';

export class CourtResponseDto {
  @ApiProperty({
    description: 'Unique identifier of the court',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'Name of the court',
    example: 'Cancha Principal',
  })
  name: string;

  @ApiPropertyOptional({
    description: 'Venue this court belongs to. Null for courts created before venues existed.',
    format: 'uuid',
    nullable: true,
    type: String,
  })
  venueId?: string | null;

  @ApiPropertyOptional({
    description: 'Description of the court',
    example: 'Cancha de fútbol 5 con césped sintético de última generación',
  })
  description?: string | null;

  @ApiPropertyOptional({
    description: 'Image URL of the court',
    example: 'https://example.com/court-image.jpg',
  })
  imageUrl?: string | null;

  @ApiProperty({
    description: 'Price per hour in decimal format',
    example: '25000.00',
  })
  pricePerHour: string;

  @ApiProperty({
    description: 'Type of court',
    enum: CourtType,
    example: CourtType.FUTBOL_5,
  })
  type: CourtType;

  @ApiProperty({
    description: 'Surface type of the court',
    enum: CourtSurface,
    example: CourtSurface.CESPED_SINTETICO,
  })
  surface: CourtSurface;

  @ApiProperty({
    description: 'Minimum number of players',
    example: 4,
  })
  minPlayers: number;

  @ApiProperty({
    description: 'Maximum number of players',
    example: 10,
  })
  maxPlayers: number;

  @ApiProperty({
    description: 'Opening time in HH:MM format',
    example: '06:00',
  })
  openingTime: string;

  @ApiProperty({
    description: 'Closing time in HH:MM format',
    example: '23:00',
  })
  closingTime: string;

  @ApiProperty({
    description: 'Available days (comma-separated, 1=Monday, 7=Sunday)',
    example: '1,2,3,4,5,6,7',
  })
  availableDays: string;

  @ApiProperty({
    description: 'Whether the court is active',
    example: true,
  })
  isActive: boolean;

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
}
