import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContactRequesterType } from '../../common/enums';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateContactRequestDto {
  @ApiProperty({ enum: ContactRequesterType })
  @IsEnum(ContactRequesterType)
  requesterType: ContactRequesterType;

  @ApiProperty({ example: 'Laura Gómez' })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'laura@example.com' })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiPropertyOptional({ example: '+57 300 123 4567' })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @MaxLength(30)
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 'Complejo Deportivo El Parque' })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @MaxLength(120)
  @IsOptional()
  organization?: string;

  @ApiProperty({ example: 'Quiero publicar tres canchas en la plataforma.' })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  message: string;

  @ApiProperty({
    description: 'The requester accepted the privacy notice for follow-up.',
    example: true,
  })
  @IsBoolean()
  @Equals(true, { message: 'Debes aceptar el aviso de privacidad.' })
  privacyAccepted: boolean;
}
