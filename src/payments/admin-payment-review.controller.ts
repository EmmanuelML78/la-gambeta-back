import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { BetterAuthUser } from '../auth/types/oauth.types';
import { AdminPaymentReviewQueryDto, ResolveAdminPaymentReviewDto } from './dto/admin-payment-review.dto';
import { AdminPaymentReviewService } from './admin-payment-review.service';

@ApiTags('Admin payment review')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('payments/admin/manual-review')
export class AdminPaymentReviewController {
  constructor(private readonly reviewService: AdminPaymentReviewService) {}

  @Get()
  @ApiOperation({ summary: 'List pending manual payment reviews' })
  findPending(@Query() query: AdminPaymentReviewQueryDto) {
    return this.reviewService.findPending(query);
  }

  @Post(':paymentAttemptId/resolve')
  @ApiOperation({ summary: 'Resolve a manual payment review without changing payment state' })
  resolve(
    @Param('paymentAttemptId', ParseUUIDPipe) paymentAttemptId: string,
    @Body() body: ResolveAdminPaymentReviewDto,
    @CurrentUser() user: BetterAuthUser,
  ) {
    return this.reviewService.resolve(paymentAttemptId, user.id, body.note);
  }
}
