export const OFFICIAL_CURRENCY = 'COP' as const;

export type OfficialCurrency = typeof OFFICIAL_CURRENCY;

export function normalizeCurrencyCode(
  currency: string | null | undefined,
): string | undefined {
  const normalized = currency?.trim().toUpperCase();
  return normalized || undefined;
}

export function isOfficialCurrency(
  currency: string | null | undefined,
): boolean {
  return normalizeCurrencyCode(currency) === OFFICIAL_CURRENCY;
}
