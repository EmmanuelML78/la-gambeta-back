import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../common/enums';
import { AdminPaymentReviewController } from './admin-payment-review.controller';
import { AdminPaymentsController } from './admin-payments.controller';
import { PaymentsController } from './payments.controller';
import { PaymentsModule } from './payments.module';

describe('AdminPaymentReviewController authorization', () => {
  const guard = new RolesGuard(new Reflector());

  function context(role: UserRole, handler: Function): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => AdminPaymentReviewController,
      switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
    } as unknown as ExecutionContext;
  }

  it('denies non-admin resolution using the application RolesGuard', () => {
    expect(() => guard.canActivate(
      context(UserRole.USER, AdminPaymentReviewController.prototype.resolve),
    )).toThrow(ForbiddenException);
  });

  it('allows ADMIN resolution', () => {
    expect(guard.canActivate(
      context(UserRole.ADMIN, AdminPaymentReviewController.prototype.resolve),
    )).toBe(true);
  });
});

describe('PaymentsModule admin controller wiring', () => {
  it('registers payment listing alongside manual review and public payment routes', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, PaymentsModule)).toEqual([
      AdminPaymentReviewController,
      AdminPaymentsController,
      PaymentsController,
    ]);
  });
});
