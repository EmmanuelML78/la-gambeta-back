import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PgDialect } from 'drizzle-orm/pg-core';
import { PaymentStatus } from '../common/enums';
import { AdminPaymentQueryDto, AdminPaymentSortDirection, AdminPaymentSortField, MAX_ADMIN_PAYMENT_PAGE } from './dto';
import { buildAdminPaymentConditions, buildAdminPaymentOrder, parseAdminPaymentBogotaDate, validateAdminPaymentDateRange } from './admin-payment-query';

describe('admin payment query contract', () => {
  it('validates bounded pagination and normalizes provider/search input', () => {
    const dto = plainToInstance(AdminPaymentQueryDto, {
      page: '2',
      limit: '100',
      provider: ' Polar ',
      search: '  booking  ',
      status: PaymentStatus.PENDING,
    });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto).toMatchObject({ page: 2, limit: 100, provider: 'polar', search: 'booking' });
    for (const page of [0, MAX_ADMIN_PAYMENT_PAGE + 1, 1e100]) {
      const invalid = plainToInstance(AdminPaymentQueryDto, { page });
      expect(validateSync(invalid).some((error) => error.property === 'page')).toBe(true);
    }
  });

  it('uses Bogotá calendar boundaries and bounds the date span', () => {
    expect(parseAdminPaymentBogotaDate('2026-08-31').toISOString()).toBe('2026-08-31T05:00:00.000Z');
    expect(() => parseAdminPaymentBogotaDate('2026-02-30')).toThrow();
    expect(() => validateAdminPaymentDateRange('2026-09-01', '2026-08-01')).toThrow();
    expect(() => validateAdminPaymentDateRange('2025-01-01', '2026-01-03')).toThrow();
  });

  it('escapes search wildcards and provides a unique ordering tie-breaker', () => {
    const query = plainToInstance(AdminPaymentQueryDto, {
      search: ' Team%_Name ',
      status: PaymentStatus.PENDING,
      dateFrom: '2026-08-01',
      dateTo: '2026-08-31',
      sortBy: AdminPaymentSortField.AMOUNT,
      sortOrder: AdminPaymentSortDirection.ASC,
    });
    const dialect = new PgDialect();
    const condition = dialect.sqlToQuery(buildAdminPaymentConditions(query)!);
    expect(condition.params).toContain('%team\\%\\_name%');
    expect(condition.params).toContain('2026-08-01T05:00:00.000Z');
    expect(condition.params).toContain('2026-09-01T05:00:00.000Z');
    expect(buildAdminPaymentOrder(query).map((item) => dialect.sqlToQuery(item).sql)).toEqual([
      '"payments"."amount" asc',
      '"payments"."id" asc',
    ]);
  });
});
