import { PaymentStatus } from '../common/enums';

export function canReplacePaymentStatus(
  current: PaymentStatus,
  incoming: PaymentStatus,
): boolean {
  if (current === PaymentStatus.PENDING) return true;
  if (current === PaymentStatus.PROCESSING) {
    return incoming !== PaymentStatus.PENDING;
  }
  return current === incoming;
}
