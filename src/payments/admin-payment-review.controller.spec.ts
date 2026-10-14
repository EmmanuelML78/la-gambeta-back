import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../common/enums';
import { AdminPaymentReviewController } from './admin-payment-review.controller';

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
