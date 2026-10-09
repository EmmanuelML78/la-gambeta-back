import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { AdminPaymentsService } from './admin-payments.service';
import type { AdminPaymentPageDto } from './dto';
import type { AdminPaymentSummaryDto } from './dto';
import type { AdminPaymentDetailDto } from './dto';
import { AdminPaymentQueryDto } from './dto';

@Controller('payments/admin')
export class AdminPaymentsController {
  constructor(private readonly adminPayments: AdminPaymentsService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  findAll(@Query() query: AdminPaymentQueryDto): Promise<AdminPaymentPageDto> {
    return this.adminPayments.findAll(query);
  }

  @Get('summary')
  @Roles(UserRole.ADMIN)
  summary(): Promise<AdminPaymentSummaryDto> {
    return this.adminPayments.summary();
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  findDetail(@Param('id', ParseUUIDPipe) id: string): Promise<AdminPaymentDetailDto> {
    return this.adminPayments.findDetail(id);
  }
}
