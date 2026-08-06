import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { DrizzleService } from '../database/drizzle.service';
import { courts, Court, NewCourt } from '../database/schema';
import { CreateCourtDto, UpdateCourtDto, CourtResponseDto } from './dto';

@Injectable()
export class CourtsService {
  constructor(private readonly drizzle: DrizzleService) {}

  async create(createCourtDto: CreateCourtDto): Promise<CourtResponseDto> {
    // Check if court with same name already exists
    const existingCourt = await this.drizzle.db
      .select()
      .from(courts)
      .where(eq(courts.name, createCourtDto.name))
      .limit(1);

    if (existingCourt.length > 0) {
      throw new ConflictException(
        `Court with name '${createCourtDto.name}' already exists`,
      );
    }

    // Validate min/max players
    if (
      createCourtDto.minPlayers &&
      createCourtDto.minPlayers > createCourtDto.maxPlayers
    ) {
      throw new ConflictException(
        'Minimum players cannot be greater than maximum players',
      );
    }

    // Validate opening/closing times
    if (createCourtDto.openingTime && createCourtDto.closingTime) {
      const openingHour = parseInt(createCourtDto.openingTime.split(':')[0]);
      const closingHour = parseInt(createCourtDto.closingTime.split(':')[0]);

      if (openingHour >= closingHour) {
        throw new ConflictException('Opening time must be before closing time');
      }
    }

    const newCourt: NewCourt = {
      ...createCourtDto,
    };

    const [createdCourt] = await this.drizzle.db
      .insert(courts)
      .values(newCourt)
      .returning();

    return this.mapToResponseDto(createdCourt);
  }

  async findAll(isActive?: boolean): Promise<CourtResponseDto[]> {
    const whereClause =
      isActive !== undefined ? eq(courts.isActive, isActive) : undefined;

    const allCourts = await this.drizzle.db
      .select()
      .from(courts)
      .where(whereClause)
      .orderBy(desc(courts.createdAt));

    return allCourts.map((court) => this.mapToResponseDto(court));
  }

  async findOne(id: string): Promise<CourtResponseDto> {
    const [court] = await this.drizzle.db
      .select()
      .from(courts)
      .where(eq(courts.id, id))
      .limit(1);

    if (!court) {
      throw new NotFoundException(`Court with ID ${id} not found`);
    }

    return this.mapToResponseDto(court);
  }

  async update(
    id: string,
    updateCourtDto: UpdateCourtDto,
  ): Promise<CourtResponseDto> {
    // Check if court exists
    const existingCourt = await this.findOne(id);

    // Check if name is being updated and already exists
    if (updateCourtDto.name && updateCourtDto.name !== existingCourt.name) {
      const courtWithSameName = await this.drizzle.db
        .select()
        .from(courts)
        .where(and(eq(courts.name, updateCourtDto.name), eq(courts.id, id)))
        .limit(1);

      if (courtWithSameName.length > 0) {
        throw new ConflictException(
          `Court with name '${updateCourtDto.name}' already exists`,
        );
      }
    }

    // Validate min/max players
    const minPlayers = updateCourtDto.minPlayers ?? existingCourt.minPlayers;
    const maxPlayers = updateCourtDto.maxPlayers ?? existingCourt.maxPlayers;

    if (minPlayers > maxPlayers) {
      throw new ConflictException(
        'Minimum players cannot be greater than maximum players',
      );
    }

    // Validate opening/closing times
    const openingTime = updateCourtDto.openingTime ?? existingCourt.openingTime;
    const closingTime = updateCourtDto.closingTime ?? existingCourt.closingTime;

    if (openingTime && closingTime) {
      const openingHour = parseInt(openingTime.split(':')[0]);
      const closingHour = parseInt(closingTime.split(':')[0]);

      if (openingHour >= closingHour) {
        throw new ConflictException('Opening time must be before closing time');
      }
    }

    const [updatedCourt] = await this.drizzle.db
      .update(courts)
      .set({
        ...updateCourtDto,
        updatedAt: new Date(),
      })
      .where(eq(courts.id, id))
      .returning();

    return this.mapToResponseDto(updatedCourt);
  }

  async remove(id: string): Promise<void> {
    // Check if court exists
    await this.findOne(id);

    // Soft delete by setting isActive to false
    await this.drizzle.db
      .update(courts)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(courts.id, id));
  }

  async hardDelete(id: string): Promise<void> {
    // Check if court exists
    await this.findOne(id);

    await this.drizzle.db.delete(courts).where(eq(courts.id, id));
  }

  private mapToResponseDto(court: Court): CourtResponseDto {
    return {
      id: court.id,
      name: court.name,
      description: court.description ?? undefined,
      // null, NO undefined: JSON.stringify borra las claves undefined y la
      // clave desaparecía del wire, rompiendo el contrato que el DTO declara
      // como `string | null`.
      imageUrl: court.imageUrl ?? null,
      pricePerHour: court.pricePerHour,
      type: court.type,
      surface: court.surface,
      minPlayers: court.minPlayers,
      maxPlayers: court.maxPlayers,
      openingTime: court.openingTime,
      closingTime: court.closingTime,
      availableDays: court.availableDays,
      isActive: court.isActive,
      createdAt: court.createdAt,
      updatedAt: court.updatedAt,
    };
  }
}
