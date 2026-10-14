import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { ContactRequestsService } from './contact-requests.service';
import {
  ContactRequestPageDto,
  ContactRequestQueryDto,
  ContactRequestResponseDto,
  CreateContactRequestDto,
  CreatedContactRequestDto,
  UpdateContactRequestStatusDto,
} from './dto';

@ApiTags('Contact requests')
@ApiBearerAuth()
@Controller('contact-requests')
export class ContactRequestsController {
  constructor(private readonly service: ContactRequestsService) {}

  @Post()
  @Public()
  @Throttle({ short: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Submit a public contact request' })
  @ApiResponse({ status: 201, type: CreatedContactRequestDto })
  async create(
    @Body() dto: CreateContactRequestDto,
  ): Promise<CreatedContactRequestDto> {
    const created = await this.service.create(dto);
    return {
      id: created.id,
      status: created.status,
      createdAt: created.createdAt,
      message: 'Recibimos tu solicitud.',
    };
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'List contact requests (Admin only)' })
  @ApiResponse({ status: 200, type: ContactRequestPageDto })
  findAll(@Query() query: ContactRequestQueryDto): Promise<ContactRequestPageDto> {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get a contact request (Admin only)' })
  @ApiResponse({ status: 200, type: ContactRequestResponseDto })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ContactRequestResponseDto> {
    return this.service.findOne(id);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Change contact request status (Admin only)' })
  @ApiResponse({ status: 200, type: ContactRequestResponseDto })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContactRequestStatusDto,
  ): Promise<ContactRequestResponseDto> {
    return this.service.updateStatus(id, dto.status);
  }
}
