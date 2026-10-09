import { ApiProperty } from '@nestjs/swagger';
import { ContactRequestStatus } from '../../common/enums';

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
