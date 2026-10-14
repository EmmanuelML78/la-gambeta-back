import { Injectable } from '@nestjs/common';
import { contactRequests } from '../database/schema';
import { DrizzleService } from '../database/drizzle.service';
import { CreateContactRequestDto } from './dto';

@Injectable()
export class ContactRequestsService {
  constructor(private readonly drizzle: DrizzleService) {}

  async create(dto: CreateContactRequestDto) {
    const [created] = await this.drizzle.db
      .insert(contactRequests)
      .values({
        requesterType: dto.requesterType,
        name: dto.name.trim(),
        email: dto.email.trim().toLowerCase(),
        phone: dto.phone?.trim() || null,
        organization: dto.organization?.trim() || null,
        message: dto.message.trim(),
        privacyAcceptedAt: new Date(),
      })
      .returning({
        id: contactRequests.id,
        status: contactRequests.status,
        createdAt: contactRequests.createdAt,
      });

    return created;
  }
}
