import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaymentStatus } from '../../common/enums';

export enum AdminPaymentSortField {
  CREATED_AT = 'createdAt',
  AMOUNT = 'amount',
  STATUS = 'status',
  PROVIDER = 'provider',
  REFUNDED_AMOUNT = 'refundedAmount',
}

export enum AdminPaymentSortDirection {
  ASC = 'asc',
  DESC = 'desc',
}

export const MAX_ADMIN_PAYMENT_PAGE = 10_000;

export class AdminPaymentQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_ADMIN_PAYMENT_PAGE)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(80)
  search?: string;

  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9._-]{0,39}$/)
  provider?: string;

  @IsOptional()
  @IsUUID()
  venueId?: string;

  @IsOptional()
  @IsUUID()
  courtId?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateFrom?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateTo?: string;

  @IsOptional()
  @IsEnum(AdminPaymentSortField)
  sortBy: AdminPaymentSortField = AdminPaymentSortField.CREATED_AT;

  @IsOptional()
  @IsEnum(AdminPaymentSortDirection)
  sortOrder: AdminPaymentSortDirection = AdminPaymentSortDirection.DESC;
}
