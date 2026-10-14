import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Logger,
  Req,
  Res,
  HttpStatus,
  UnauthorizedException,
  RawBodyRequest,
  Headers,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { PaymentsService } from './payments.service';
import { CreatePreferenceDto, ProcessPaymentDto } from './dto';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../database/schema';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('create-preference')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create MercadoPago payment preference (Checkout Pro)',
  })
  @ApiResponse({
    status: 201,
    description: 'Payment preference created successfully',
    schema: {
      type: 'object',
      properties: {
        paymentAttemptId: { type: 'string' },
        preferenceId: { type: 'string' },
        initPoint: { type: 'string' },
        sandboxInitPoint: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async createPreference(
    @Body() createPreferenceDto: CreatePreferenceDto,
    @CurrentUser() user: User,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    this.logger.log(
      `Creating preference for user: ${user.id}, booking: ${createPreferenceDto.bookingId}`,
    );

    return await this.paymentsService.createPreference(
      createPreferenceDto,
      user.id,
      user.role,
      idempotencyKey,
    );
  }

  @Post('process-payment')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Process payment with card (Checkout API)' })
  @ApiResponse({
    status: 201,
    description: 'Payment processed successfully',
    schema: {
      type: 'object',
      properties: {
        paymentId: { type: 'string' },
        status: { type: 'string' },
        statusDetail: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async processPayment(
    @Body() processPaymentDto: ProcessPaymentDto,
    @CurrentUser() user: User,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    this.logger.log(
      `Processing payment for user: ${user.id}, booking: ${processPaymentDto.bookingId}`,
    );

    return await this.paymentsService.processPayment(
      processPaymentDto,
      user.id,
      user.role,
      idempotencyKey,
    );
  }

  @Post('webhook')
  @Public()
  @ApiOperation({ summary: 'Payment provider webhook endpoint' })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid webhook signature' })
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
  ) {
    try {
      await this.paymentsService.handleWebhook({
        query: req.query,
        headers: req.headers,
        body: req.body,
        rawBody: req.rawBody,
      });
      res.status(HttpStatus.OK).json({ received: true });
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        res
          .status(HttpStatus.UNAUTHORIZED)
          .json({ error: 'Invalid signature' });
        return;
      }
      // Error de procesamiento -> 500 para que el proveedor reintente.
      this.logger.error(
        `Webhook processing error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ error: 'Webhook processing failed' });
    }
  }

  @Get('methods')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get available payment methods' })
  @ApiResponse({
    status: 200,
    description: 'Payment methods retrieved successfully',
  })
  getPaymentMethods() {
    this.logger.log('Getting payment methods');

    return this.paymentsService.getPaymentMethods();
  }

  @Get('booking/:bookingId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get payment details for a booking' })
  @ApiResponse({
    status: 200,
    description: 'Payment details retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  async getPaymentByBookingId(@Param('bookingId') bookingId: string) {
    const payment = await this.paymentsService.getPaymentByBookingId(bookingId);

    if (!payment) {
      return { payment: null };
    }

    return { payment };
  }

  @Get(':paymentId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get payment details by payment ID' })
  @ApiResponse({
    status: 200,
    description: 'Payment details retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  async getPaymentById(@Param('paymentId') paymentId: string) {
    const payment = await this.paymentsService.getPaymentById(paymentId);

    if (!payment) {
      return { payment: null };
    }

    return { payment };
  }
}
