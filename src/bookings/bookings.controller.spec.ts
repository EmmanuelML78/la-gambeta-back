import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { BookingStatus, UserRole } from '../common/enums';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { BookingsController } from './bookings.controller';

describe('BookingsController admin booking routes', () => {
  it('marks the paginated endpoint ADMIN-only and registers it before the dynamic ID route', () => {
    const prototype = BookingsController.prototype;
    const routeMethods = Object.getOwnPropertyNames(prototype).filter(
      (name) => Reflect.getMetadata(METHOD_METADATA, prototype[name]) === 0,
    );
    const adminRouteIndex = routeMethods.findIndex(
      (name) => Reflect.getMetadata(PATH_METADATA, prototype[name]) === 'admin',
    );
    const dynamicRouteIndex = routeMethods.findIndex(
      (name) => Reflect.getMetadata(PATH_METADATA, prototype[name]) === ':id',
    );

    expect(
      Reflect.getMetadata(ROLES_KEY, prototype.findAllAdminPaginated),
    ).toEqual([UserRole.ADMIN]);
    expect(adminRouteIndex).toBeGreaterThanOrEqual(0);
    expect(adminRouteIndex).toBeLessThan(dynamicRouteIndex);
  });

  it('keeps the legacy all-bookings array path and status filter unchanged', async () => {
    const result = [{ id: 'booking-1' }];
    const service = { findAll: jest.fn().mockResolvedValue(result) };
    const controller = new BookingsController(service as never);
    await expect(controller.findAllAdmin(BookingStatus.PENDING)).resolves.toBe(
      result,
    );
    expect(service.findAll).toHaveBeenCalledWith(
      undefined,
      BookingStatus.PENDING,
    );
  });
});
