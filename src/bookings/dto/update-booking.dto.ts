import { PartialType } from '@nestjs/swagger';
import { CreateBookingDto } from './create-booking.dto';

/**
 * Update público de una reserva. NO incluye `status` a propósito:
 * el estado solo lo cambia el flujo de pago (webhook) o un admin por su
 * endpoint dedicado (PATCH /bookings/:id/status). Con `forbidNonWhitelisted`
 * global, mandar `status` acá devuelve 400.
 */
export class UpdateBookingDto extends PartialType(CreateBookingDto) {}
