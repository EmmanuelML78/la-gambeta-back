/**
 * Timeout Interceptor
 * Prevents long-running requests from blocking the system
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  RequestTimeoutException,
} from '@nestjs/common';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { timeout, catchError } from 'rxjs/operators';
import { LoggerService } from '../utils/logger.service';

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(
    private readonly timeoutMs: number = 30000, // 30 seconds default
    private readonly logger?: LoggerService,
  ) {
    if (this.logger) {
      this.logger.setContext('TimeoutInterceptor');
    }
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<{ method: string; url: string }>();
    const { method, url } = request;

    return next.handle().pipe(
      timeout(this.timeoutMs),
      catchError((error) => {
        if (error instanceof TimeoutError) {
          this.logger?.error('Request timeout', error, {
            method,
            url,
            timeoutMs: this.timeoutMs,
          });

          return throwError(
            () =>
              new RequestTimeoutException(
                `Request timeout: The request took too long to process (${this.timeoutMs}ms)`,
              ),
          );
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return throwError(() => error);
      }),
    );
  }
}
