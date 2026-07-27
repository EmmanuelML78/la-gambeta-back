import { TransactionStatus } from './transaction-status.enum';

export enum BookingStatus {
  DRAFT = 'draft',
  CONFIRMED = 'confirmed',
  ACTIVE = 'active',
  FINISHED = 'finished',
  NO_SHOW = 'no_show',
  PENDING = TransactionStatus.PENDING,
  PROCESSING = TransactionStatus.PROCESSING,
  COMPLETED = TransactionStatus.COMPLETED,
  FAILED = TransactionStatus.FAILED,
  CANCELLED = TransactionStatus.CANCELLED,
}
