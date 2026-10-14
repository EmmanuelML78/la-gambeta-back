import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  AdminBookingQueryDto,
  MAX_ADMIN_BOOKING_PAGE,
} from './admin-booking-page.dto';
import { BookingStatus } from '../../common/enums';

describe('AdminBookingQueryDto', () => {
  it('defaults and transforms bounded pagination while preserving the status filter', () => {
    expect(new AdminBookingQueryDto()).toMatchObject({ page: 1, limit: 20 });
    const dto = plainToInstance(AdminBookingQueryDto, {
      page: '2',
      limit: '100',
      status: BookingStatus.PENDING,
    });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto).toMatchObject({
      page: 2,
      limit: 100,
      status: BookingStatus.PENDING,
    });
  });

  it.each([
    ['page', 0],
    ['page', MAX_ADMIN_BOOKING_PAGE + 1],
    ['limit', 0],
    ['limit', 101],
    ['page', 1.5],
    ['limit', Number.NaN],
  ])('rejects invalid %s value %s', (field, value) => {
    const errors = validateSync(
      plainToInstance(AdminBookingQueryDto, { [field]: value }),
    );
    expect(errors.some((error) => error.property === field)).toBe(true);
  });
});
