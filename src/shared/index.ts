/**
 * Shared Module Barrel Export
 * Centralizes all shared functionality
 */

// Decorators
export * from './decorators/api-response.decorator';

// Interceptors
export * from './interceptors';

// Pipes
export * from './pipes/validation.pipe';
export * from './pipes/parse-uuid.pipe';

// Utils
export * from './utils/logger.service';
export * from './utils/logger.module';
