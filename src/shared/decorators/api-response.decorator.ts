/**
 * Advanced API Response Decorators
 * Professional API documentation with consistent response formats
 */

import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiResponse,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ApiResponseOptions,
  getSchemaPath,
  ApiExtraModels,
} from '@nestjs/swagger';

// Generic API response wrapper
export class ApiResponseWrapper<T> {
  success!: boolean;
  data?: T;
  message?: string;
  errors?: string[];
  timestamp!: Date;
  requestId!: string;
}

// Pagination wrapper
export class PaginatedResponse<T> {
  data!: T[];
  total!: number;
  page!: number;
  limit!: number;
  totalPages!: number;
  hasNext!: boolean;
  hasPrevious!: boolean;
}

// Custom decorators for common responses
export const ApiSuccessResponse = <TModel extends Type<any>>(
  model: TModel,
  description: string = 'Success',
) => {
  return applyDecorators(
    ApiExtraModels(ApiResponseWrapper, model),
    ApiResponse({
      status: 200,
      description,
      schema: {
        allOf: [
          { $ref: getSchemaPath(ApiResponseWrapper) },
          {
            properties: {
              data: { $ref: getSchemaPath(model) },
            },
          },
        ],
      },
    }),
  );
};

export const ApiSuccessArrayResponse = <TModel extends Type<any>>(
  model: TModel,
  description: string = 'Success',
) => {
  return applyDecorators(
    ApiExtraModels(ApiResponseWrapper, model),
    ApiResponse({
      status: 200,
      description,
      schema: {
        allOf: [
          { $ref: getSchemaPath(ApiResponseWrapper) },
          {
            properties: {
              data: {
                type: 'array',
                items: { $ref: getSchemaPath(model) },
              },
            },
          },
        ],
      },
    }),
  );
};

export const ApiPaginatedResponse = <TModel extends Type<any>>(
  model: TModel,
  description: string = 'Paginated results',
) => {
  return applyDecorators(
    ApiExtraModels(ApiResponseWrapper, PaginatedResponse, model),
    ApiResponse({
      status: 200,
      description,
      schema: {
        allOf: [
          { $ref: getSchemaPath(ApiResponseWrapper) },
          {
            properties: {
              data: {
                allOf: [
                  { $ref: getSchemaPath(PaginatedResponse) },
                  {
                    properties: {
                      data: {
                        type: 'array',
                        items: { $ref: getSchemaPath(model) },
                      },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    }),
  );
};

export const ApiCreatedResponse = <TModel extends Type<any>>(
  model: TModel,
  description: string = 'Created successfully',
) => {
  return applyDecorators(
    ApiExtraModels(ApiResponseWrapper, model),
    ApiResponse({
      status: 201,
      description,
      schema: {
        allOf: [
          { $ref: getSchemaPath(ApiResponseWrapper) },
          {
            properties: {
              data: { $ref: getSchemaPath(model) },
            },
          },
        ],
      },
    }),
  );
};

export const ApiBadRequestResponse = (description: string = 'Bad Request') => {
  return ApiResponse({
    status: 400,
    description,
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        message: { type: 'string', example: 'Validation failed' },
        errors: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              message: { type: 'string' },
              constraints: { type: 'object' },
              value: { type: 'any' },
            },
          },
        },
        timestamp: { type: 'string', format: 'date-time' },
        requestId: { type: 'string', format: 'uuid' },
      },
    },
  });
};

export const ApiNotFoundResponse = (resource: string = 'Resource') => {
  return ApiResponse({
    status: 404,
    description: `${resource} not found`,
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        message: { type: 'string', example: `${resource} not found` },
        timestamp: { type: 'string', format: 'date-time' },
        requestId: { type: 'string', format: 'uuid' },
      },
    },
  });
};

export const ApiUnauthorizedResponse = () => {
  return ApiResponse({
    status: 401,
    description: 'Unauthorized',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        message: { type: 'string', example: 'Unauthorized access' },
        timestamp: { type: 'string', format: 'date-time' },
        requestId: { type: 'string', format: 'uuid' },
      },
    },
  });
};

export const ApiForbiddenResponse = () => {
  return ApiResponse({
    status: 403,
    description: 'Forbidden',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        message: { type: 'string', example: 'Access forbidden' },
        timestamp: { type: 'string', format: 'date-time' },
        requestId: { type: 'string', format: 'uuid' },
      },
    },
  });
};

export const ApiConflictResponse = () => {
  return ApiResponse({
    status: 409,
    description: 'Conflict',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        message: { type: 'string', example: 'Resource conflict' },
        timestamp: { type: 'string', format: 'date-time' },
        requestId: { type: 'string', format: 'uuid' },
      },
    },
  });
};
