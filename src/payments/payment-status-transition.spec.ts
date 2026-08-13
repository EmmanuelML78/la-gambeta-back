import { PaymentStatus } from '../common/enums';
import { canReplacePaymentStatus } from './payment-status-transition';

describe('canReplacePaymentStatus', () => {
  it('does not let a late pending event overwrite a successful payment', () => {
    expect(
      canReplacePaymentStatus(PaymentStatus.SUCCEEDED, PaymentStatus.PENDING),
    ).toBe(false);
  });

  it('does not let a later refund erase a successful payment record', () => {
    expect(
      canReplacePaymentStatus(PaymentStatus.SUCCEEDED, PaymentStatus.REFUNDED),
    ).toBe(false);
  });

  it('keeps a failed payment terminal when older events arrive later', () => {
    expect(
      canReplacePaymentStatus(PaymentStatus.FAILED, PaymentStatus.PENDING),
    ).toBe(false);
  });

  it('allows a pending payment to advance to succeeded', () => {
    expect(
      canReplacePaymentStatus(PaymentStatus.PENDING, PaymentStatus.SUCCEEDED),
    ).toBe(true);
  });
});
