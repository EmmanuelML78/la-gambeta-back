import 'reflect-metadata';
import { UserRole } from '../common/enums';
import { User } from '../database/schema';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

describe('PaymentsController checkout idempotency', () => {
  it('forwards the authenticated user and idempotency header to the service', async () => {
    const createPreference = jest.fn().mockResolvedValue({
      paymentAttemptId: '223e4567-e89b-12d3-a456-426614174000',
      preferenceId: 'checkout-1',
      initPoint: 'https://checkout.test/1',
      sandboxInitPoint: 'https://checkout.test/1',
    });
    const controller = new PaymentsController({
      createPreference,
    } as unknown as PaymentsService);
    const user = {
      id: 'user-1',
      role: UserRole.USER,
    } as User;
    const dto = {
      bookingId: '123e4567-e89b-12d3-a456-426614174000',
    };

    await controller.createPreference(dto, user, 'checkout-key-0001');

    expect(createPreference).toHaveBeenCalledWith(
      dto,
      user.id,
      user.role,
      'checkout-key-0001',
    );
  });
});
