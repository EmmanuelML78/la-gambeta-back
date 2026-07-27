/**
 * Logging Interceptor
 * Professional request/response logging with performance tracking
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { LoggerService } from '../utils/logger.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: LoggerService) {
    this.logger.setContext('HttpRequest');
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { requestId?: string }>();
    const response = context.switchToHttp().getResponse<Response>();
    const { method, url, headers, query, params, ip } = request;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const body = (request as Request).body;

    // Generate request ID if not present
    const requestId = (headers['x-request-id'] as string) || uuidv4();
    request.requestId = requestId;
    response.setHeader('x-request-id', requestId);

    // Set request ID in logger context
    this.logger.setRequestId(requestId);

    const startTime = Date.now();
    const userAgent = headers['user-agent'] || 'unknown';

    // Log incoming request
    this.logger.http('Incoming request', {
      method,
      url,
      userAgent,
      ip,
      query:
        Object.keys((query as Record<string, unknown>) || {}).length > 0
          ? query
          : undefined,
      params:
        Object.keys((params as Record<string, unknown>) || {}).length > 0
          ? params
          : undefined,

      bodySize: this.getBodySize(body),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      hasBody: !!body && Object.keys(body).length > 0,
    });

    return next.handle().pipe(
      tap((responseData) => {
        const endTime = Date.now();
        const duration = endTime - startTime;
        const { statusCode } = response;

        // Log successful response
        this.logger.http('Request completed', {
          method,
          url,
          statusCode,
          duration,
          responseSize: this.getResponseSize(responseData),
        });

        // Log performance warning for slow requests
        if (duration > 1000) {
          this.logger.warn('Slow request detected', {
            method,
            url,
            duration,
            threshold: 1000,
          });
        }

        // Log performance metrics
        this.logger.logPerformance(`${method} ${url}`, duration, {
          statusCode,
          responseSize: this.getResponseSize(responseData),
        });
      }),
      catchError((error: Error & { status?: number; statusCode?: number }) => {
        const endTime = Date.now();
        const duration = endTime - startTime;
        const statusCode = error.status || error.statusCode || 500;

        // Log error response
        this.logger.error('Request failed', error, {
          method,
          url,
          statusCode,
          duration,
          errorName: error.name,
          errorMessage: error.message,
        });

        throw error;
      }),
    );
  }

  private getBodySize(body: unknown): number {
    if (!body) return 0;
    try {
      return JSON.stringify(body).length;
    } catch {
      return 0;
    }
  }

  private getResponseSize(responseData: unknown): number {
    if (!responseData) return 0;
    try {
      return JSON.stringify(responseData).length;
    } catch {
      return 0;
    }
  }
}
