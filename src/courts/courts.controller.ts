import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  ParseBoolPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { CourtsService } from './courts.service';
import { CreateCourtDto, UpdateCourtDto, CourtResponseDto } from './dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/enums';

@ApiTags('Courts')
@ApiBearerAuth()
@Controller('courts')
export class CourtsController {
  constructor(private readonly courtsService: CourtsService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a new court (Admin only)' })
  @ApiResponse({
    status: 201,
    description: 'The court has been successfully created.',
    type: CourtResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'Court with the same name already exists.',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized.',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden. Admin role required.',
  })
  async create(
    @Body() createCourtDto: CreateCourtDto,
  ): Promise<CourtResponseDto> {
    return this.courtsService.create(createCourtDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all courts' })
  @ApiQuery({
    name: 'isActive',
    required: false,
    description: 'Filter courts by active status',
    type: Boolean,
  })
  @ApiQuery({
    name: 'venueId',
    required: false,
    description: 'Filter courts by venue',
    format: 'uuid',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'List of courts retrieved successfully.',
    type: [CourtResponseDto],
  })
  async findAll(
    @Query('isActive', new ParseBoolPipe({ optional: true }))
    isActive?: boolean,
    // `optional: true` es imprescindible: sin eso el pipe rechaza la ausencia
    // del parámetro con 400 y el listado sin filtro deja de funcionar.
    @Query('venueId', new ParseUUIDPipe({ optional: true }))
    venueId?: string,
  ): Promise<CourtResponseDto[]> {
    return this.courtsService.findAll(isActive, venueId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a court by ID' })
  @ApiParam({
    name: 'id',
    description: 'Court ID',
    type: 'string',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Court retrieved successfully.',
    type: CourtResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Court not found.',
  })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CourtResponseDto> {
    return this.courtsService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update a court (Admin only)' })
  @ApiParam({
    name: 'id',
    description: 'Court ID',
    type: 'string',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'The court has been successfully updated.',
    type: CourtResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Court not found.',
  })
  @ApiResponse({
    status: 409,
    description: 'Court with the same name already exists.',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized.',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden. Admin role required.',
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateCourtDto: UpdateCourtDto,
  ): Promise<CourtResponseDto> {
    return this.courtsService.update(id, updateCourtDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete a court (Admin only)' })
  @ApiParam({
    name: 'id',
    description: 'Court ID',
    type: 'string',
    format: 'uuid',
  })
  @ApiResponse({
    status: 204,
    description: 'The court has been successfully soft deleted (deactivated).',
  })
  @ApiResponse({
    status: 404,
    description: 'Court not found.',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized.',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden. Admin role required.',
  })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.courtsService.remove(id);
  }

  @Delete(':id/hard')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Permanently delete a court (Admin only)' })
  @ApiParam({
    name: 'id',
    description: 'Court ID',
    type: 'string',
    format: 'uuid',
  })
  @ApiResponse({
    status: 204,
    description: 'The court has been permanently deleted.',
  })
  @ApiResponse({
    status: 404,
    description: 'Court not found.',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized.',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden. Admin role required.',
  })
  async hardDelete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.courtsService.hardDelete(id);
  }
}
