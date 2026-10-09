import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { auditEvents, payments } from '../database/schema';
import { DrizzleService } from '../database/drizzle.service';
import { AdminPaymentReviewService } from './admin-payment-review.service';
import { AdminPaymentReviewQueryDto } from './dto/admin-payment-review.dto';

const PAYMENT_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '223e4567-e89b-12d3-a456-426614174000';

function query(rows: unknown[]) {
  const builder: any = {
    from: jest.fn(),
    where: jest.fn(),
    orderBy: jest.fn(),
    limit: jest.fn(),
    offset: jest.fn(),
    for: jest.fn(),
    then: (resolve: (value: unknown[]) => unknown, reject?: (error: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
  };
  for (const method of ['from', 'where', 'orderBy', 'limit', 'offset']) {
    builder[method].mockReturnValue(builder);
  }
  builder.for.mockResolvedValue(rows);
  return builder;
}

function createService() {
  const tx = {
    select: jest.fn(),
    update: jest.fn(),
    insert: jest.fn(),
  };
  const db = {
    select: jest.fn(),
    transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)),
  };
  return {
    service: new AdminPaymentReviewService({ db } as unknown as DrizzleService),
    db,
    tx,
  };
}

describe('AdminPaymentReviewService', () => {
  it('returns a stable paginated view of pending manual reviews', async () => {
    const row = {
      paymentAttemptId: PAYMENT_ID,
      bookingId: '323e4567-e89b-12d3-a456-426614174000',
      provider: 'mercadopago',
      paymentFlow: 'direct_card',
      status: 'processing',
      amount: '90000.00',
      currency: 'COP',
      reason: 'Provider response was uncertain',
      flaggedAt: new Date('2026-10-01T10:00:00Z'),
      createdAt: new Date('2026-10-01T09:00:00Z'),
    };
    const pageQuery = query([row]);
    const countQuery = query([{ total: '26' }]);
    const { service, db } = createService();
    db.select.mockReturnValueOnce(pageQuery).mockReturnValueOnce(countQuery);

    await expect(service.findPending({ page: 2, limit: 25 })).resolves.toEqual({
      items: [row],
      total: 26,
      page: 2,
      limit: 25,
      totalPages: 2,
    });
    expect(pageQuery.orderBy).toHaveBeenCalledTimes(1);
    expect(pageQuery.limit).toHaveBeenCalledWith(25);
    expect(pageQuery.offset).toHaveBeenCalledWith(25);
    expect(pageQuery.where).toHaveBeenCalledTimes(1);
    expect(countQuery.where).toHaveBeenCalledTimes(1);
  });

  it('atomically resolves only the review flag and records the responsible admin and note', async () => {
    let pending = true;
    const { service, tx, db } = createService();
    tx.select.mockImplementation(() => query([{ id: PAYMENT_ID, manualReview: pending }]));
    const set = jest.fn().mockImplementation((values: Record<string, unknown>) => ({
      where: jest.fn().mockReturnValue({
        returning: jest.fn().mockImplementation(async () => {
          if (!pending || values.manualReview !== false) return [];
          pending = false;
          return [{ id: PAYMENT_ID }];
        }),
      }),
    }));
    tx.update.mockReturnValue({ set });
    const audit = jest.fn().mockResolvedValue(undefined);
    tx.insert.mockReturnValue({ values: audit });

    await expect(service.resolve(PAYMENT_ID, ADMIN_ID, ' Reviewed with provider evidence ')).resolves.toEqual({
      paymentAttemptId: PAYMENT_ID,
      reviewStatus: 'resolved',
    });
    await expect(service.resolve(PAYMENT_ID, ADMIN_ID, 'Second resolution')).rejects.toBeInstanceOf(ConflictException);

    expect(db.transaction).toHaveBeenCalledTimes(2);
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalledWith(payments);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ manualReview: false }));
    expect(set.mock.calls[0][0]).not.toHaveProperty('status');
    expect(set.mock.calls[0][0]).not.toHaveProperty('refundedAmount');
    expect(audit).toHaveBeenCalledTimes(1);
    expect(tx.insert).toHaveBeenCalledWith(auditEvents);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      actorType: 'admin',
      actorId: ADMIN_ID,
      action: 'manual_payment_review_resolved',
      entityType: 'payment',
      entityId: PAYMENT_ID,
      reason: 'Reviewed with provider evidence',
    }));
  });

  it('rejects missing review records and blank notes without mutation', async () => {
    const { service, tx } = createService();
    tx.select.mockReturnValue(query([]));
    await expect(service.resolve(PAYMENT_ID, ADMIN_ID, 'valid note')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.resolve(PAYMENT_ID, ADMIN_ID, '  ')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });
});
