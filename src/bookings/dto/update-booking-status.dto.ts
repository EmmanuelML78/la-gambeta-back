import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { BookingStatus } from '../../common/enums';

/** Body del endpoint admin PATCH /bookings/:id/status. */
export class UpdateBookingStatusDto {
  @ApiProperty({ enum: BookingStatus, description: 'New booking status' })
  @IsEnum(BookingStatus)
  status: BookingStatus;
}
