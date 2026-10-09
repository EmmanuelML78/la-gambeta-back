import { Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, ilike, or, SQL } from 'drizzle-orm';
import { ContactRequestStatus } from '../common/enums';
import { contactRequests, NewContactRequest } from '../database/schema';
import { DrizzleService } from '../database/drizzle.service';
import {
  ContactRequestPageDto,
  ContactRequestQueryDto,
  ContactRequestResponseDto,
  CreateContactRequestDto,
} from './dto';

@Injectable()
export class ContactRequestsService {
  constructor(private readonly drizzle: DrizzleService) {}

  async create(dto: CreateContactRequestDto) {
    const value: NewContactRequest = {
      requesterType: dto.requesterType,
      name: dto.name.trim(),
      email: dto.email.trim().toLowerCase(),
      phone: dto.phone?.trim() || null,
      organization: dto.organization?.trim() || null,
      message: dto.message.trim(),
      privacyAcceptedAt: new Date(),
    };
    const [created] = await this.drizzle.db
      .insert(contactRequests)
      .values(value)
      .returning({
        id: contactRequests.id,
        status: contactRequests.status,
        createdAt: contactRequests.createdAt,
      });

    return created;
  }

  async findAll(query: ContactRequestQueryDto): Promise<ContactRequestPageDto> {
    const conditions: SQL[] = [];
    if (query.status) conditions.push(eq(contactRequests.status, query.status));
    if (query.requesterType) {
      conditions.push(eq(contactRequests.requesterType, query.requesterType));
    }
    if (query.search) {
      const search = `%${query.search}%`;
      conditions.push(
        or(
          ilike(contactRequests.name, search),
          ilike(contactRequests.email, search),
          ilike(contactRequests.organization, search),
        )!,
      );
    }

    const where = conditions.length ? and(...conditions) : undefined;
    const [rows, [{ total }]] = await Promise.all([
      this.drizzle.db
        .select()
        .from(contactRequests)
        .where(where)
        .orderBy(desc(contactRequests.createdAt))
        .limit(query.limit)
        .offset(query.offset),
      this.drizzle.db
        .select({ total: count() })
        .from(contactRequests)
        .where(where),
    ]);

    return {
      items: rows.map((row) => ContactRequestResponseDto.fromEntity(row)),
      total: Number(total),
      limit: query.limit,
      offset: query.offset,
    };
  }

  async findOne(id: string): Promise<ContactRequestResponseDto> {
    const [request] = await this.drizzle.db
      .select()
      .from(contactRequests)
      .where(eq(contactRequests.id, id))
      .limit(1);

    if (!request) {
      throw new NotFoundException('Solicitud de contacto no encontrada');
    }
    return ContactRequestResponseDto.fromEntity(request);
  }

  async updateStatus(
    id: string,
    status: ContactRequestStatus,
  ): Promise<ContactRequestResponseDto> {
    const [updated] = await this.drizzle.db
      .update(contactRequests)
      .set({ status, updatedAt: new Date() })
      .where(eq(contactRequests.id, id))
      .returning();

    if (!updated) {
      throw new NotFoundException('Solicitud de contacto no encontrada');
    }
    return ContactRequestResponseDto.fromEntity(updated);
  }
}
