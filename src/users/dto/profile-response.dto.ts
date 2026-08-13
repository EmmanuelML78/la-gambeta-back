import { ApiProperty } from '@nestjs/swagger';
import { User } from '../../database/schema';
import { UserRole } from '../../common/enums';

/**
 * Proyección explícita del usuario hacia el cliente.
 *
 * NO se devuelve la fila cruda de `users`: se enumeran los campos uno por uno
 * para que agregar una columna sensible al schema (un token, un secreto) no la
 * filtre por HTTP sin que nadie lo note.
 */
export class ProfileResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty({ nullable: true, type: String })
  name: string | null;

  @ApiProperty({ nullable: true, type: String })
  image: string | null;

  @ApiProperty({ enum: UserRole })
  role: UserRole;

  @ApiProperty()
  emailVerified: boolean;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: Date;

  static fromEntity(user: User): ProfileResponseDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      // null, NO undefined: JSON.stringify borra las claves undefined y el
      // schema zod del front las exige presentes.
      name: user.name ?? null,
      image: user.image ?? null,
      role: user.role,
      emailVerified: user.emailVerified,
      isActive: user.isActive,
      createdAt: user.createdAt,
    };
  }
}
