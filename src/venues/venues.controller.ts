import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { VenuesService } from './venues.service';
import { CreateVenueDto, UpdateVenueDto, VenueResponseDto } from './dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/enums';

@ApiTags('Venues')
@ApiBearerAuth()
@Controller('venues')
export class VenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  @Get()
  @ApiOperation({ summary: 'List venues with their court count' })
  @ApiQuery({
    name: 'includeInactive',
    required: false,
    description: 'Admin only in practice: also returns deactivated venues',
    type: Boolean,
  })
  @ApiResponse({ status: 200, type: [VenueResponseDto] })
  findAll(
    @Query('includeInactive', new ParseBoolPipe({ optional: true }))
    includeInactive?: boolean,
  ): Promise<VenueResponseDto[]> {
    return this.venuesService.findAll(includeInactive ?? false);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a venue by id' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: VenueResponseDto })
  @ApiResponse({ status: 404, description: 'Venue not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<VenueResponseDto> {
    return this.venuesService.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a venue (Admin only)' })
  @ApiResponse({ status: 201, type: VenueResponseDto })
  create(@Body() dto: CreateVenueDto): Promise<VenueResponseDto> {
    return this.venuesService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update a venue (Admin only)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: VenueResponseDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVenueDto,
  ): Promise<VenueResponseDto> {
    return this.venuesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Deactivate a venue (Admin only). Soft delete.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: VenueResponseDto })
  @ApiResponse({ status: 400, description: 'The venue still has active courts' })
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VenueResponseDto> {
    return this.venuesService.deactivate(id);
  }
}
