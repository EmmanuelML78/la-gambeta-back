import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

/**
 * Lista blanca CERRADA de lo que un usuario puede cambiar de sí mismo.
 *
 * `UsersService.update()` también acepta `role`, `isActive` y `emailVerified`.
 * Ninguno puede estar acá: con `forbidNonWhitelisted` global un body con
 * `role` es rechazado con 400, y el controller además construye el objeto
 * campo por campo. Dos barreras, porque una escalada de privilegios por
 * PATCH de perfil es de las más baratas de explotar.
 *
 * `email` tampoco: cambiarlo exige re-verificación, que es otro flujo.
 */
export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Emmanuel', minLength: 1, maxLength: 100 })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Valencia', minLength: 1, maxLength: 100 })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  lastName?: string;
}
