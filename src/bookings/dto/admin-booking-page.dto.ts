import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { BookingStatus } from '../../common/enums';

export const MAX_ADMIN_BOOKING_PAGE = 10_000;

export class AdminBookingQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_ADMIN_BOOKING_PAGE)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;
}

export class AdminBookingListItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  bookingDate: Date;

  @ApiProperty()
  startTime: string;

  @ApiProperty()
  endTime: string;

  @ApiProperty({ enum: BookingStatus })
  status: BookingStatus;

  @ApiProperty()
  totalPrice: string;

  @ApiProperty({
    type: 'object',
    properties: { id: { type: 'string' }, name: { type: 'string' } },
  })
  user: { id: string; name: string };

  @ApiProperty({
    type: 'object',
    properties: { id: { type: 'string' }, name: { type: 'string' } },
  })
  court: { id: string; name: string };
}

export class AdminBookingPageDto {
  @ApiProperty({ type: [AdminBookingListItemDto] })
  items: AdminBookingListItemDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}
