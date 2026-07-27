/**
 * Advanced Validation Pipe
 * Enhanced validation with detailed error messages and custom transformations
 */

import {
  ArgumentMetadata,
  Injectable,
  PipeTransform,
  BadRequestException,
} from '@nestjs/common';
import { validate, ValidationError } from 'class-validator';
import { plainToClass } from 'class-transformer';
import { LoggerService } from '../utils/logger.service';

interface ValidationPipeOptions {
  transform?: boolean;
  disableErrorMessages?: boolean;
  whitelist?: boolean;
  forbidNonWhitelisted?: boolean;
  skipMissingProperties?: boolean;
  groups?: string[];
  always?: boolean;
}

@Injectable()
export class AdvancedValidationPipe implements PipeTransform<unknown> {
  private readonly logger: LoggerService | null = null;

  constructor(private readonly options: ValidationPipeOptions = {}) {
    // Logger initialization is optional
  }

  async transform(
    value: unknown,
    metadata: ArgumentMetadata,
  ): Promise<unknown> {
    const { metatype } = metadata;

    if (!metatype || !this.toValidate(metatype)) {
      return value;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const object = plainToClass(metatype, value, {
      enableImplicitConversion: this.options.transform || false,
      excludeExtraneousValues: this.options.whitelist || false,
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const errors = await validate(object, {
      skipMissingProperties: this.options.skipMissingProperties || false,
      whitelist: this.options.whitelist || false,
      forbidNonWhitelisted: this.options.forbidNonWhitelisted || false,
      groups: this.options.groups || [],
      always: this.options.always || false,
    });

    if (errors.length > 0) {
      const formattedErrors = this.formatValidationErrors(errors);

      if (this.logger) {
        this.logger.warn('Validation failed', {
          errors: formattedErrors,
          originalValue: value,
          metatype: metatype.name,
        });
      }

      throw new BadRequestException({
        message: 'Validation failed',
        errors: formattedErrors,
        statusCode: 400,
      });
    }

    return object;
  }

  private toValidate(metatype: any): boolean {
    const types: any[] = [String, Boolean, Number, Array, Object];
    return !types.includes(metatype);
  }

  private formatValidationErrors(errors: ValidationError[]): Array<{
    field: string;
    message: string;
    constraints?: object;
    value: unknown;
  }> {
    return errors
      .map((error) => this.mapChildrenToValidationErrors(error))
      .flat();
  }

  private mapChildrenToValidationErrors(
    error: ValidationError,
    parentPath?: string,
  ): Array<{
    field: string;
    message: string;
    constraints?: object;
    value: unknown;
  }> {
    const currentPath = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;

    if (!(error.children && error.children.length)) {
      return [
        {
          field: currentPath,
          message: Object.values(error.constraints || {}).join(', '),
          constraints: error.constraints,
          value: error.value,
        },
      ];
    }

    const validationErrors: Array<{
      field: string;
      message: string;
      constraints?: object;
      value: unknown;
    }> = [];
    for (const item of error.children) {
      validationErrors.push(
        ...this.mapChildrenToValidationErrors(item, currentPath),
      );
    }

    return validationErrors;
  }
}
