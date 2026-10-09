import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { AdminPaymentsService } from './admin-payments.service';
import type { AdminPaymentPageDto } from './dto';
import { AdminPaymentQueryDto } from './dto';

@Controller('payments/admin')
export class AdminPaymentsController {
  constructor(private readonly adminPayments: AdminPaymentsService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  findAll(@Query() query: AdminPaymentQueryDto): Promise<AdminPaymentPageDto> {
    return this.adminPayments.findAll(query);
  }
}
