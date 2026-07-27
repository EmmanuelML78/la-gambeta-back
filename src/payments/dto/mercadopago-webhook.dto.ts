import { IsNotEmpty, IsString, IsOptional, IsNumber } from 'class-validator';

export class MercadoPagoWebhookDto {
  @IsNotEmpty()
  @IsString()
  id: string;

  @IsNotEmpty()
  @IsString()
  type: string;

  @IsNotEmpty()
  @IsString()
  action: string;

  @IsOptional()
  @IsString()
  api_version?: string;

  @IsOptional()
  @IsString()
  date_created?: string;

  @IsOptional()
  @IsNumber()
  user_id?: number;

  @IsOptional()
  @IsString()
  live_mode?: string;

  data?: {
    id: string;
  };
}
