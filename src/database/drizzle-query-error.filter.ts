import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { DrizzleQueryError } from 'drizzle-orm';
import type { Response } from 'express';

@Catch(DrizzleQueryError)
export class DrizzleQueryErrorFilter implements ExceptionFilter<DrizzleQueryError> {
  private readonly logger = new Logger(DrizzleQueryErrorFilter.name);

  catch(_exception: DrizzleQueryError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    this.logger.error('Database query failed; details redacted');
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  }
}
