/**
 * Enhanced UUID Parse Pipe
 * Validates and parses UUID with branded types support
 */

import { Injectable, PipeTransform } from '@nestjs/common';
// import { ValidationException } from '../../core/exceptions';
import { BadRequestException } from '@nestjs/common';
import { isUUID } from 'class-validator';

@Injectable()
export class ParseUUIDPipe implements PipeTransform<string, string> {
  constructor(private readonly parameterName: string = 'id') {}

  transform(value: string): string {
    if (!value) {
      throw new BadRequestException(`${this.parameterName} is required`);
    }

    if (!isUUID(value)) {
      throw new BadRequestException(
        `${this.parameterName} must be a valid UUID`,
      );
    }

    return value;
  }
}
