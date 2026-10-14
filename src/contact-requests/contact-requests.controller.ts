import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { ContactRequestsService } from './contact-requests.service';
import { CreateContactRequestDto, CreatedContactRequestDto } from './dto';

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
}
