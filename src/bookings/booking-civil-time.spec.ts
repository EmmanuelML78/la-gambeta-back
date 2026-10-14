import { BadRequestException } from '@nestjs/common';
import {
  bogotaCivilInstant,
  bogotaCivilWeekday,
  isBogotaCivilStartElapsed,
  isCourtOpenOnCivilDate,
  parseCivilDate,
  parseCivilTime,
} from './booking-civil-time';

describe('Bogota booking civil time helpers', () => {
  it('converts a civil date and time without host timezone drift', () => {
    expect(bogotaCivilWeekday('2026-09-01')).toBe(2);
    expect(bogotaCivilInstant('2026-09-01', '18:30').toISOString()).toBe(
      '2026-09-01T23:30:00.000Z',
    );
    expect(isCourtOpenOnCivilDate('1, 2,5,invalid,8', '2026-09-01')).toBe(
      true,
    );
    expect(isCourtOpenOnCivilDate('1,5', '2026-09-01')).toBe(false);
  });

  it('treats a start at the current instant as elapsed', () => {
    const now = new Date('2026-09-01T23:30:00.000Z');
    expect(isBogotaCivilStartElapsed('2026-09-01', '18:30', now)).toBe(true);
    expect(isBogotaCivilStartElapsed('2026-09-01', '19:00', now)).toBe(false);
  });

  it.each(['2026-02-30', '2026-9-01', '2026-09-01T00:00:00Z'])(
    'rejects invalid civil date %s',
    (date) => {
      expect(() => parseCivilDate(date)).toThrow(BadRequestException);
    },
  );

  it.each(['8:00', '24:00', '18:60'])(
    'rejects invalid civil time %s',
    (time) => {
      expect(() => parseCivilTime(time)).toThrow(BadRequestException);
    },
  );
});
