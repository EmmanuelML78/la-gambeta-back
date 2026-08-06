import { PartialType } from '@nestjs/swagger';
import { CreateVenueDto } from './create-venue.dto';

/**
 * Todos los campos opcionales, mismas validaciones. `PartialType` las hereda
 * en vez de duplicarlas, que es como se desincronizan los DTOs.
 */
export class UpdateVenueDto extends PartialType(CreateVenueDto) {}
