import { BadRequestException } from '@nestjs/common';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

export function parseIdempotencyKey(value: string | undefined): string {
  const key = value?.trim();
  if (!key || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new BadRequestException(
      'Idempotency-Key must contain 8 to 128 URL-safe characters',
    );
  }
  return key;
}
