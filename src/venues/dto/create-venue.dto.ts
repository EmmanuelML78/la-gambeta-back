import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class CreateVenueDto {
  @ApiProperty({ example: 'La Gambeta Chapinero' })
  @IsString()
  @Length(1, 120)
  name: string;

  @ApiProperty({ example: 'Calle 63 #11-50' })
  @IsString()
  @Length(1, 240)
  address: string;

  @ApiPropertyOptional({ example: 'Bogotá' })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  city?: string;

  @ApiPropertyOptional({ example: '+57 601 555 0101' })
  @IsOptional()
  @IsString()
  @Length(1, 40)
  phone?: string;

  /**
   * Se validan como coordenadas de verdad, no como número suelto: `IsLatitude`
   * acota a [-90, 90] y `IsLongitude` a [-180, 180]. Un valor fuera de rango
   * no rompe nada en la base, pero manda el pin al medio del océano.
   *
   * Viajan como string para no perder precisión al pasar por un float de JS,
   * igual que salen en la respuesta.
   */
  @ApiPropertyOptional({ example: '4.64840000' })
  @IsOptional()
  @IsLatitude()
  latitude?: string;

  @ApiPropertyOptional({ example: '-74.06280000' })
  @IsOptional()
  @IsLongitude()
  longitude?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
