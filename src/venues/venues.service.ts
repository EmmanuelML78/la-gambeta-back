import { Injectable, NotFoundException } from '@nestjs/common';
import { and, count, eq } from 'drizzle-orm';
import { DrizzleService } from '../database/drizzle.service';
import { courts, venues } from '../database/schema';
import { VenueResponseDto } from './dto/venue-response.dto';

@Injectable()
export class VenuesService {
  constructor(private readonly drizzle: DrizzleService) {}

  /**
   * Sedes activas con su cantidad de canchas activas.
   *
   * El conteo sale en la MISMA consulta con un LEFT JOIN agrupado: hacer un
   * count por sede sería el clásico N+1, y el mapa las pide todas juntas.
   */
  async findAll(): Promise<VenueResponseDto[]> {
    const rows = await this.drizzle.db
      .select({ venue: venues, courtCount: count(courts.id) })
      .from(venues)
      .leftJoin(
        courts,
        and(eq(courts.venueId, venues.id), eq(courts.isActive, true)),
      )
      .where(eq(venues.isActive, true))
      .groupBy(venues.id)
      .orderBy(venues.name);

    return rows.map((row) =>
      VenueResponseDto.fromEntity(row.venue, Number(row.courtCount)),
    );
  }

  async findOne(id: string): Promise<VenueResponseDto> {
    const [venue] = await this.drizzle.db
      .select()
      .from(venues)
      .where(eq(venues.id, id))
      .limit(1);

    if (!venue) {
      throw new NotFoundException('Sede no encontrada');
    }

    const [{ value }] = await this.drizzle.db
      .select({ value: count(courts.id) })
      .from(courts)
      .where(and(eq(courts.venueId, id), eq(courts.isActive, true)));

    return VenueResponseDto.fromEntity(venue, Number(value));
  }
}
