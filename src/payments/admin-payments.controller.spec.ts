import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { AdminPaymentsController } from './admin-payments.controller';

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
});
