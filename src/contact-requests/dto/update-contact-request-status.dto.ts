import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ContactRequestStatus } from '../../common/enums';

export class UpdateContactRequestStatusDto {
  @ApiProperty({ enum: ContactRequestStatus })
  @IsEnum(ContactRequestStatus)
  status: ContactRequestStatus;
}
