import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, count, eq } from 'drizzle-orm';
import { DrizzleService } from '../database/drizzle.service';
import { courts, venues, NewVenue } from '../database/schema';
import {
  CreateVenueDto,
  UpdateVenueDto,
  VenueResponseDto,
} from './dto';

@Injectable()
export class VenuesService {
  constructor(private readonly drizzle: DrizzleService) {}

  /**
   * Sedes con su cantidad de canchas activas.
   *
   * El conteo sale en la MISMA consulta con un LEFT JOIN agrupado: hacer un
   * count por sede sería el clásico N+1, y el mapa las pide todas juntas.
   *
   * `includeInactive` existe para el panel de administración: el dueño tiene
   * que poder ver y reactivar una sede que dio de baja. El listado público
   * nunca lo pasa.
   */
  async findAll(includeInactive = false): Promise<VenueResponseDto[]> {
    const rows = await this.drizzle.db
      .select({ venue: venues, courtCount: count(courts.id) })
      .from(venues)
      .leftJoin(
        courts,
        and(eq(courts.venueId, venues.id), eq(courts.isActive, true)),
      )
      .where(includeInactive ? undefined : eq(venues.isActive, true))
      .groupBy(venues.id)
      .orderBy(venues.name);

    return rows.map((row) =>
      VenueResponseDto.fromEntity(row.venue, Number(row.courtCount)),
    );
  }

  async findOne(id: string): Promise<VenueResponseDto> {
    const venue = await this.getOrThrow(id);
    return VenueResponseDto.fromEntity(venue, await this.countCourts(id));
  }

  async create(dto: CreateVenueDto): Promise<VenueResponseDto> {
    const [created] = await this.drizzle.db
      .insert(venues)
      .values(dto as NewVenue)
      .returning();

    return VenueResponseDto.fromEntity(created, 0);
  }

  async update(id: string, dto: UpdateVenueDto): Promise<VenueResponseDto> {
    await this.getOrThrow(id);

    const [updated] = await this.drizzle.db
      .update(venues)
      .set({ ...dto, updatedAt: new Date() })
      .where(eq(venues.id, id))
      .returning();

    return VenueResponseDto.fromEntity(updated, await this.countCourts(id));
  }

  /**
   * Baja lógica. NO se borra la fila: `courts.venue_id` tiene ON DELETE SET
   * NULL, así que un delete real dejaría las canchas huérfanas y sin forma de
   * saber dónde estaban. Desactivar la saca del listado público y conserva
   * el vínculo.
   */
  async deactivate(id: string): Promise<VenueResponseDto> {
    await this.getOrThrow(id);

    const activeCourts = await this.countCourts(id);
    if (activeCourts > 0) {
      throw new BadRequestException(
        `La sede tiene ${activeCourts} cancha(s) activa(s). Desactivalas primero.`,
      );
    }

    return this.update(id, { isActive: false });
  }

  private async getOrThrow(id: string) {
    const [venue] = await this.drizzle.db
      .select()
      .from(venues)
      .where(eq(venues.id, id))
      .limit(1);

    if (!venue) {
      throw new NotFoundException('Sede no encontrada');
    }
    return venue;
  }

  private async countCourts(venueId: string): Promise<number> {
    const [{ value }] = await this.drizzle.db
      .select({ value: count(courts.id) })
      .from(courts)
      .where(and(eq(courts.venueId, venueId), eq(courts.isActive, true)));
    return Number(value);
  }
}
