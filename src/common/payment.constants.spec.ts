import {
  isOfficialCurrency,
  normalizeCurrencyCode,
  OFFICIAL_CURRENCY,
} from './payment.constants';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { payments } from '../database/schema';

describe('official payment currency', () => {
  it('uses COP as the single official currency', () => {
    expect(OFFICIAL_CURRENCY).toBe('COP');
  });

  it.each([
    ['cop', 'COP'],
    [' Cop ', 'COP'],
    ['COP', 'COP'],
    [undefined, undefined],
  ])('normalizes %p to %p', (input, expected) => {
    expect(normalizeCurrencyCode(input)).toBe(expected);
  });

  it('accepts only normalized COP', () => {
    expect(isOfficialCurrency('cop')).toBe(true);
    expect(isOfficialCurrency('ARS')).toBe(false);
    expect(isOfficialCurrency(undefined)).toBe(false);
  });

  it('uses the official currency for new payment rows', () => {
    const currencyColumn = getTableConfig(payments).columns.find(
      (column) => column.name === 'currency',
    );

    expect(currencyColumn?.default).toBe(OFFICIAL_CURRENCY);
  });
});
