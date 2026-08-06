import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { VenuesService } from './venues.service';
import { VenueResponseDto } from './dto/venue-response.dto';

@ApiTags('Venues')
@ApiBearerAuth()
@Controller('venues')
export class VenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  @Get()
  @ApiOperation({ summary: 'List active venues with their court count' })
  @ApiResponse({ status: 200, type: [VenueResponseDto] })
  findAll(): Promise<VenueResponseDto[]> {
    return this.venuesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a venue by id' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: VenueResponseDto })
  @ApiResponse({ status: 404, description: 'Venue not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VenueResponseDto> {
    return this.venuesService.findOne(id);
  }
}
