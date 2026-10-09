import { BookingStatus, PaymentStatus } from '../../common/enums';

export interface AdminPaymentListItemDto {
  id: string;
  provider: string | null;
  status: PaymentStatus;
  amount: string;
  currency: string;
  refundedAmount: string | null;
  createdAt: Date;
  updatedAt: Date;
  booking: {
    id: string;
    status: BookingStatus;
    bookingDate: Date;
    startTime: string;
    endTime: string;
  };
  court: { id: string; name: string };
  venue: { id: string; name: string } | null;
}

export interface AdminPaymentPageDto {
  items: AdminPaymentListItemDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
