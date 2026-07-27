import { TransactionStatus } from './transaction-status.enum';

export enum PaymentStatus {
  SUCCEEDED = 'succeeded',
  REFUNDED = 'refunded',
  PARTIALLY_REFUNDED = 'partially_refunded',
  PENDING = TransactionStatus.PENDING,
  PROCESSING = TransactionStatus.PROCESSING,
  COMPLETED = TransactionStatus.COMPLETED,
  FAILED = TransactionStatus.FAILED,
  CANCELLED = TransactionStatus.CANCELLED,
}
