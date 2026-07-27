import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  IsInt,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePreferenceDto {
  @ApiProperty({
    description: 'Booking ID for the payment',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @IsNotEmpty()
  @IsUUID()
  bookingId: string;

  @ApiProperty({
    description: 'Payment amount',
    example: 5000.5,
    minimum: 1,
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiPropertyOptional({
    description: 'Currency code (default ARS)',
    example: 'ARS',
    default: 'ARS',
  })
  @IsOptional()
  @IsString()
  currency?: string = 'ARS';

  @ApiPropertyOptional({
    description: 'Number of installments',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  installments?: number = 1;

  @ApiPropertyOptional({
    description: 'Payer email address',
    example: 'user@example.com',
  })
  @IsOptional()
  @IsString()
  payerEmail?: string;

  @ApiPropertyOptional({
    description: 'Payment description',
    example: 'Reserva de cancha de tenis - Cancha A',
  })
  @IsOptional()
  @IsString()
  description?: string;
}
