import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsEnum,
  Min,
  Max,
  Matches,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CourtType, CourtSurface } from '../../common/enums';

export class CreateCourtDto {
  @ApiProperty({
    description: 'Name of the court',
    example: 'Cancha Principal',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description: 'Venue this court belongs to',
    format: 'uuid',
  })
  @IsUUID()
  @IsOptional()
  venueId?: string;

  @ApiPropertyOptional({
    description: 'Description of the court',
    example: 'Cancha de fútbol 5 con césped sintético de última generación',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Image URL of the court',
    example: 'https://example.com/court-image.jpg',
  })
  @IsString()
  @IsOptional()
  imageUrl?: string;

  @ApiProperty({
    description: 'Price per hour in decimal format',
    example: '25000.00',
    type: 'string',
  })
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'Price must be a valid decimal number with up to 2 decimal places',
  })
  pricePerHour: string;

  @ApiProperty({
    description: 'Type of court',
    enum: CourtType,
    example: CourtType.FUTBOL_5,
  })
  @IsEnum(CourtType)
  type: CourtType;

  @ApiProperty({
    description: 'Surface type of the court',
    enum: CourtSurface,
    example: CourtSurface.CESPED_SINTETICO,
  })
  @IsEnum(CourtSurface)
  surface: CourtSurface;

  @ApiPropertyOptional({
    description: 'Minimum number of players',
    example: 4,
    default: 2,
  })
  @IsNumber()
  @Min(1)
  @Max(50)
  @IsOptional()
  minPlayers?: number = 2;

  @ApiProperty({
    description: 'Maximum number of players',
    example: 10,
  })
  @IsNumber()
  @Min(1)
  @Max(50)
  maxPlayers: number;

  @ApiPropertyOptional({
    description: 'Opening time in HH:MM format',
    example: '06:00',
    default: '06:00',
  })
  @IsString()
  @Matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Opening time must be in HH:MM format',
  })
  @IsOptional()
  openingTime?: string = '06:00';

  @ApiPropertyOptional({
    description: 'Closing time in HH:MM format',
    example: '23:00',
    default: '23:00',
  })
  @IsString()
  @Matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Closing time must be in HH:MM format',
  })
  @IsOptional()
  closingTime?: string = '23:00';

  @ApiPropertyOptional({
    description: 'Available days (comma-separated, 1=Monday, 7=Sunday)',
    example: '1,2,3,4,5,6,7',
    default: '1,2,3,4,5,6,7',
  })
  @IsString()
  @Matches(/^[1-7](,[1-7])*$/, {
    message: 'Available days must be comma-separated numbers from 1-7',
  })
  @IsOptional()
  availableDays?: string = '1,2,3,4,5,6,7';
}
