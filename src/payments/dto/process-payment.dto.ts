import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  IsObject,
  IsInt,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProcessPaymentDto {
  @ApiProperty({
    description: 'Booking ID for the payment',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @IsNotEmpty()
  @IsUUID()
  bookingId: string;

  @ApiProperty({
    description: 'Token from card tokenization',
    example: 'ff8080814c11e237014c1ff593b57b4d',
  })
  @IsNotEmpty()
  @IsString()
  token: string;

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
    description: 'Payment method ID',
    example: 'visa',
  })
  @IsOptional()
  @IsString()
  paymentMethodId?: string;

  @ApiPropertyOptional({
    description: 'Issuer ID',
    example: '310',
  })
  @IsOptional()
  @IsString()
  issuerId?: string;

  @ApiPropertyOptional({
    description: 'Payer information',
    example: {
      email: 'user@example.com',
      identification: {
        type: 'DNI',
        number: '12345678',
      },
    },
  })
  @IsOptional()
  @IsObject()
  payer?: {
    email?: string;
    identification?: {
      type: string;
      number: string;
    };
  };

  @ApiPropertyOptional({
    description: 'Payment description',
    example: 'Reserva de cancha de tenis - Cancha A',
  })
  @IsOptional()
  @IsString()
  description?: string;
}
