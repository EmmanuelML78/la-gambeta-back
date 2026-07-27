/**
 * Logger Service
 * Professional logging service with context and request tracking
 */

import { Injectable, Inject, Scope } from '@nestjs/common';
import { Logger } from 'winston';
import { v4 as uuidv4 } from 'uuid';

@Injectable({ scope: Scope.TRANSIENT })
export class LoggerService {
  private context: string = 'Application';
  private requestId?: string;

  constructor(@Inject('WINSTON_LOGGER') private readonly logger: Logger) {}

  setContext(context: string): void {
    this.context = context;
  }

  setRequestId(requestId?: string): void {
    this.requestId = requestId || uuidv4();
  }

  private formatMessage(
    message: string,
    meta?: Record<string, unknown>,
  ): Record<string, unknown> {
    const logMeta = {
      context: this.context,
      requestId: this.requestId,
      timestamp: new Date().toISOString(),
      ...meta,
    };

    return { message, ...logMeta };
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    const logData = this.formatMessage(message, {
      ...meta,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : error,
    });

    this.logger.error(logData);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.logger.warn(this.formatMessage(message, meta));
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.logger.info(this.formatMessage(message, meta));
  }

  http(message: string, meta?: Record<string, unknown>): void {
    this.logger.http(this.formatMessage(message, meta));
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.logger.debug(this.formatMessage(message, meta));
  }

  verbose(message: string, meta?: Record<string, unknown>): void {
    this.logger.verbose(this.formatMessage(message, meta));
  }

  // Business specific logging methods
  logUserAction(
    userId: string,
    action: string,
    resource?: string,
    meta?: Record<string, unknown>,
  ): void {
    this.info(`User action: ${action}`, {
      userId,
      action,
      resource,
      category: 'user-action',
      ...meta,
    });
  }

  logSecurityEvent(
    event: string,
    userId?: string,
    meta?: Record<string, unknown>,
  ): void {
    this.warn(`Security event: ${event}`, {
      userId,
      event,
      category: 'security',
      ...meta,
    });
  }

  logPerformance(
    operation: string,
    duration: number,
    meta?: Record<string, unknown>,
  ): void {
    this.info(`Performance: ${operation} completed in ${duration}ms`, {
      operation,
      duration,
      category: 'performance',
      ...meta,
    });
  }

  logBusinessEvent(
    event: string,
    entityId?: string,
    meta?: Record<string, unknown>,
  ): void {
    this.info(`Business event: ${event}`, {
      event,
      entityId,
      category: 'business',
      ...meta,
    });
  }

  logDatabaseQuery(
    query: string,
    duration?: number,
    meta?: Record<string, unknown>,
  ): void {
    this.debug(`Database query executed`, {
      query,
      duration,
      category: 'database',
      ...meta,
    });
  }

  logApiRequest(
    method: string,
    url: string,
    statusCode: number,
    duration: number,
    meta?: Record<string, unknown>,
  ): void {
    this.http(`${method} ${url} ${statusCode} - ${duration}ms`, {
      method,
      url,
      statusCode,
      duration,
      category: 'api',
      ...meta,
    });
  }

  // Method to create child logger with preserved context
  child(additionalContext: string): LoggerService {
    const childLogger = new LoggerService(this.logger);
    childLogger.setContext(`${this.context}:${additionalContext}`);
    childLogger.setRequestId(this.requestId);
    return childLogger;
  }
}
