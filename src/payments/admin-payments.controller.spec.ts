import { ExecutionContext, ForbiddenException, ParseUUIDPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { AdminPaymentsController } from './admin-payments.controller';
import { AdminPaymentReviewController } from './admin-payment-review.controller';
import { PaymentsModule } from './payments.module';

describe('AdminPaymentsController list access', () => {
  const guard = new RolesGuard(new Reflector());

  function context(role: UserRole): ExecutionContext {
    return {
      getHandler: () => AdminPaymentsController.prototype.findAll,
      getClass: () => AdminPaymentsController,
      switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
    } as unknown as ExecutionContext;
  }

  it('is a protected GET route available only to ADMIN', () => {
    const handler = AdminPaymentsController.prototype.findAll;
    expect(Reflect.getMetadata(PATH_METADATA, AdminPaymentsController)).toBe('payments/admin');
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('/');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(0);
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([UserRole.ADMIN]);
    expect(() => guard.canActivate(context(UserRole.USER))).toThrow(ForbiddenException);
    expect(guard.canActivate(context(UserRole.ADMIN))).toBe(true);
  });

  it('registers the COP summary as a separate ADMIN-only route', () => {
    const handler = AdminPaymentsController.prototype.summary;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('summary');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(0);
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([UserRole.ADMIN]);
    const summaryGuard = new RolesGuard(new Reflector());
    const context = {
      getHandler: () => handler,
      getClass: () => AdminPaymentsController,
      switchToHttp: () => ({ getRequest: () => ({ user: { role: UserRole.USER } }) }),
    } as unknown as ExecutionContext;
    expect(() => summaryGuard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('keeps summary and manual-review routes ahead of the UUID detail route', async () => {
    const handler = AdminPaymentsController.prototype.findDetail;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(':id');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(0);
    expect(Reflect.getMetadata(PATH_METADATA, AdminPaymentReviewController)).toBe('payments/admin/manual-review');
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, PaymentsModule) as Function[];
    expect(controllers.indexOf(AdminPaymentReviewController)).toBeLessThan(controllers.indexOf(AdminPaymentsController));
    expect(Object.getOwnPropertyNames(AdminPaymentsController.prototype).indexOf('summary'))
      .toBeLessThan(Object.getOwnPropertyNames(AdminPaymentsController.prototype).indexOf('findDetail'));
    await expect(new ParseUUIDPipe().transform('manual-review', { type: 'param', data: 'id', metatype: String }))
      .rejects.toThrow();
  });

  it('protects payment detail with ADMIN authorization', () => {
    const handler = AdminPaymentsController.prototype.findDetail;
    const detailGuard = new RolesGuard(new Reflector());
    const context = {
      getHandler: () => handler,
      getClass: () => AdminPaymentsController,
      switchToHttp: () => ({ getRequest: () => ({ user: { role: UserRole.USER } }) }),
    } as unknown as ExecutionContext;
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([UserRole.ADMIN]);
    expect(() => detailGuard.canActivate(context)).toThrow(ForbiddenException);
  });
});
