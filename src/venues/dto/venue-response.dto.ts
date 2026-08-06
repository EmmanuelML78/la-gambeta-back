import { ApiProperty } from '@nestjs/swagger';
import { Venue } from '../../database/schema';

/**
 * Proyección explícita de una sede. Igual que ProfileResponseDto: campo por
 * campo, nunca la fila cruda, y `?? null` en vez de `?? undefined` porque
 * JSON.stringify borra las claves undefined y el schema zod del front las
 * exige presentes.
 *
 * Las coordenadas viajan como STRING: son `decimal` en Postgres y el driver
 * las devuelve así para no perder precisión al pasarlas por un float de JS.
 * La conversión a número es responsabilidad de quien dibuja el mapa.
 */
export class VenueResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  address: string;

  @ApiProperty({ nullable: true, type: String })
  city: string | null;

  @ApiProperty({ nullable: true, type: String })
  phone: string | null;

  @ApiProperty({ nullable: true, type: String, example: '4.71100000' })
  latitude: string | null;

  @ApiProperty({ nullable: true, type: String, example: '-74.07210000' })
  longitude: string | null;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ description: 'Cantidad de canchas activas en la sede' })
  courtCount: number;

  static fromEntity(venue: Venue, courtCount = 0): VenueResponseDto {
    return {
      id: venue.id,
      name: venue.name,
      address: venue.address,
      city: venue.city ?? null,
      phone: venue.phone ?? null,
      latitude: venue.latitude ?? null,
      longitude: venue.longitude ?? null,
      isActive: venue.isActive,
      courtCount,
    };
  }
}
