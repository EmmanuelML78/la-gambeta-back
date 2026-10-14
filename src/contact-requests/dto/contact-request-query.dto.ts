import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ContactRequesterType, ContactRequestStatus } from '../../common/enums';

export class ContactRequestQueryDto {
  @ApiPropertyOptional({ enum: ContactRequestStatus })
  @IsEnum(ContactRequestStatus)
  @IsOptional()
  status?: ContactRequestStatus;

  @ApiPropertyOptional({ enum: ContactRequesterType })
  @IsEnum(ContactRequesterType)
  @IsOptional()
  requesterType?: ContactRequesterType;

  @ApiPropertyOptional({ description: 'Search name, email or organization' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit = 50;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  offset = 0;
}
