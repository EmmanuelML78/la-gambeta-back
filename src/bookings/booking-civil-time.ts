import { BadRequestException } from '@nestjs/common';

export const BOGOTA_TIME_ZONE = 'America/Bogota';
export const CIVIL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const CIVIL_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

interface CivilDateParts {
  year: number;
  month: number;
  day: number;
}

export function parseCivilDate(value: string): CivilDateParts {
  if (!CIVIL_DATE_PATTERN.test(value)) {
    throw new BadRequestException('Booking date must use YYYY-MM-DD format');
  }
  const [year, month, day] = value.split('-').map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new BadRequestException('Booking date is not a valid civil date');
  }
  return { year, month, day };
}

export function parseCivilTime(value: string): {
  hour: number;
  minute: number;
} {
  if (!CIVIL_TIME_PATTERN.test(value)) {
    throw new BadRequestException('Booking time must use HH:MM format');
  }
  const [hour, minute] = value.split(':').map(Number);
  return { hour, minute };
}

export function bogotaCivilInstant(date: string, time: string): Date {
  const { year, month, day } = parseCivilDate(date);
  const { hour, minute } = parseCivilTime(time);
  // America/Bogota is permanently UTC-05:00 and has no DST transitions.
  return new Date(Date.UTC(year, month - 1, day, hour + 5, minute));
}

export function civilDateFromStoredValue(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : value.slice(0, 10);
}

export function bogotaCivilWeekday(date: string): number {
  const { year, month, day } = parseCivilDate(date);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

export function isCourtOpenOnCivilDate(
  availableDays: string,
  date: string,
): boolean {
  const allowed = availableDays
    .split(',')
    .map((day) => Number(day.trim()))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7);
  return allowed.includes(bogotaCivilWeekday(date));
}

export function isBogotaCivilStartElapsed(
  date: string,
  startTime: string,
  now = new Date(),
): boolean {
  return bogotaCivilInstant(date, startTime).getTime() <= now.getTime();
}
