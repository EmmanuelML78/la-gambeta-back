import { Transform, Type } from 'class-transformer';
import { IsInt, IsString, Max, Min, MinLength, MaxLength } from 'class-validator';

export class AdminPaymentReviewQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}

export class ResolveAdminPaymentReviewDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  note!: string;
}
