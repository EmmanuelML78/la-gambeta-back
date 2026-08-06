import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Patch,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { ProfileResponseDto, UpdateProfileDto } from './dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../database/schema';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the authenticated user profile' })
  @ApiResponse({ status: 200, type: ProfileResponseDto })
  async getMe(@CurrentUser() current: User): Promise<ProfileResponseDto> {
    // Se relee de la base en vez de proyectar el usuario del guard: la sesión
    // puede traer datos viejos si el perfil cambió en otra pestaña.
    const user = await this.usersService.findById(current.id);
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return ProfileResponseDto.fromEntity(user);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the authenticated user profile' })
  @ApiResponse({ status: 200, type: ProfileResponseDto })
  async updateMe(
    @CurrentUser() current: User,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileResponseDto> {
    // El id sale SIEMPRE de la sesión, nunca del body o de un param: así no
    // existe forma de editar el perfil de otro.
    // Los campos se copian uno por uno; nunca se hace spread del dto, porque
    // un `role` que se colara terminaría en UsersService.update().
    const updated = await this.usersService.update(current.id, {
      firstName: dto.firstName,
      lastName: dto.lastName,
    });
    return ProfileResponseDto.fromEntity(updated);
  }
}
