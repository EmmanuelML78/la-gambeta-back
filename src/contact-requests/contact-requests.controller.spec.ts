import 'reflect-metadata';
import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../common/enums';
import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler/dist/throttler.constants';
import { ContactRequestsController } from './contact-requests.controller';

describe('ContactRequestsController public intake', () => {
  it('exposes only the submission endpoint as public and protects admin routes', () => {
    const prototype = ContactRequestsController.prototype;
    expect(
      Reflect.getMetadata(
        IS_PUBLIC_KEY,
        Reflect.get(prototype, 'create'),
      ),
    ).toBe(true);
    for (const method of ['findAll', 'findOne', 'updateStatus'] as const) {
      const handler = Reflect.get(prototype, method);
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBeUndefined();
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([UserRole.ADMIN]);
    }
  });

  it.each(['findAll', 'findOne', 'updateStatus'] as const)(
    'denies a non-admin role on %s through the application guard',
    (method) => {
      const context = {
        getHandler: () => Reflect.get(ContactRequestsController.prototype, method),
        getClass: () => ContactRequestsController,
        switchToHttp: () => ({ getRequest: () => ({ user: { role: UserRole.USER } }) }),
      } as unknown as ExecutionContext;
      const guard = new RolesGuard(new Reflector());

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    },
  );

  it('uses the target short throttle bucket at three submissions per minute', () => {
    const handler = Reflect.get(ContactRequestsController.prototype, 'create');
    expect(Reflect.getMetadata(`${THROTTLER_LIMIT}short`, handler)).toBe(3);
    expect(Reflect.getMetadata(`${THROTTLER_TTL}short`, handler)).toBe(60_000);
  });

  it('returns only the receipt fields and does not expose submitted personal data', async () => {
    const service = {
      create: jest.fn().mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000201',
        status: 'NEW',
        createdAt: new Date('2026-08-29T12:00:00.000Z'),
      }),
    };
    const controller = new ContactRequestsController(service as never);

    const result = await controller.create({
      name: 'Private Name',
      email: 'private@example.com',
      phone: '+57 300 000 0000',
      organization: 'Private Organization',
      message: 'Private message content',
    } as never);

    expect(Object.keys(result).sort()).toEqual(['createdAt', 'id', 'message', 'status']);
    expect(JSON.stringify(result)).not.toContain('private@example.com');
    expect(JSON.stringify(result)).not.toContain('Private message content');
    expect(service.create).toHaveBeenCalledTimes(1);
  });
});
