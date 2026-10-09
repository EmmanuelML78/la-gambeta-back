import { ApiProperty } from '@nestjs/swagger';
import { ContactRequestStatus, ContactRequesterType } from '../../common/enums';
import { ContactRequest } from '../../database/schema';

export class ContactRequestResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: ContactRequesterType })
  requesterType: ContactRequesterType;

  @ApiProperty()
  name: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ nullable: true, type: String })
  phone: string | null;

  @ApiProperty({ nullable: true, type: String })
  organization: string | null;

  @ApiProperty()
  message: string;

  @ApiProperty({ enum: ContactRequestStatus })
  status: ContactRequestStatus;

  @ApiProperty()
  privacyAcceptedAt: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  static fromEntity(entity: ContactRequest): ContactRequestResponseDto {
    return {
      ...entity,
      phone: entity.phone ?? null,
      organization: entity.organization ?? null,
    };
  }
}

export class CreatedContactRequestDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: ContactRequestStatus })
  status: ContactRequestStatus;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ example: 'Recibimos tu solicitud.' })
  message: string;
}

export class ContactRequestPageDto {
  @ApiProperty({ type: [ContactRequestResponseDto] })
  items: ContactRequestResponseDto[];

  @ApiProperty({ description: 'Total records matching the active filters' })
  total: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  offset: number;
}
