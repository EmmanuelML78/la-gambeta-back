/**
 * Transform Interceptor
 * Standardizes API responses with consistent format
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request, Response } from 'express';
// import { ApiResponse } from '../../core/types';
interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
  timestamp: Date;
  requestId: string;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    if (context.getType() !== 'http') {
      return next.handle() as Observable<ApiResponse<T>>;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { requestId?: string }>();
    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((data: T): ApiResponse<T> => {
        const requestId = request.requestId || 'unknown';
        const statusCode = response.statusCode;

        // Don't transform if data is already in the expected format
        if (
          data &&
          typeof data === 'object' &&
          'success' in data &&
          'timestamp' in data
        ) {
          return data as unknown as ApiResponse<T>;
        }

        // Create standardized response
        return {
          success: statusCode >= 200 && statusCode < 300,
          data,
          message: this.getSuccessMessage(request.method, statusCode),
          timestamp: new Date(),
          requestId,
        };
      }),
    );
  }

  private getSuccessMessage(method: string, statusCode: number): string {
    switch (statusCode) {
      case 200:
        return method === 'GET'
          ? 'Data retrieved successfully'
          : 'Operation completed successfully';
      case 201:
        return 'Resource created successfully';
      case 204:
        return 'Resource deleted successfully';
      default:
        return 'Operation completed successfully';
    }
  }
}
