import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { count, desc, eq, and } from 'drizzle-orm';
import { auditEvents, payments } from '../database/schema';
import { DrizzleService } from '../database/drizzle.service';
import { AdminPaymentReviewQueryDto } from './dto/admin-payment-review.dto';

@Injectable()
export class AdminPaymentReviewService {
  constructor(private readonly drizzle: DrizzleService) {}

  async findPending(query: AdminPaymentReviewQueryDto) {
    const where = eq(payments.manualReview, true);
    const offset = (query.page - 1) * query.limit;
    const [rows, countRows] = await Promise.all([
      this.drizzle.db
        .select({
          paymentAttemptId: payments.id,
          bookingId: payments.bookingId,
          provider: payments.provider,
          paymentFlow: payments.paymentFlow,
          status: payments.status,
          amount: payments.amount,
          currency: payments.currency,
          reason: payments.manualReviewReason,
          flaggedAt: payments.manualReviewAt,
          createdAt: payments.createdAt,
        })
        .from(payments)
        .where(where)
        .orderBy(desc(payments.manualReviewAt), desc(payments.id))
        .limit(query.limit)
        .offset(offset),
      this.drizzle.db
        .select({ total: count() })
        .from(payments)
        .where(where),
    ]);
    const total = Number(countRows[0]?.total ?? 0);
    return {
      items: rows,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
    };
  }

  async resolve(paymentAttemptId: string, adminId: string, rawNote: string) {
    const note = rawNote?.trim();
    if (!note) throw new BadRequestException('Resolution note is required');

    return this.drizzle.db.transaction(async (tx) => {
      const [payment] = await tx
        .select({
          id: payments.id,
          manualReview: payments.manualReview,
          manualReviewReason: payments.manualReviewReason,
          manualReviewAt: payments.manualReviewAt,
        })
        .from(payments)
        .where(eq(payments.id, paymentAttemptId))
        .limit(1)
        .for('update');
      if (!payment) throw new NotFoundException('Payment attempt not found');
      if (!payment.manualReview) {
        throw new ConflictException('Manual payment review is already resolved');
      }

      const [updated] = await tx
        .update(payments)
        .set({ manualReview: false, updatedAt: new Date() })
        .where(and(eq(payments.id, paymentAttemptId), eq(payments.manualReview, true)))
        .returning({ id: payments.id });
      if (!updated) {
        throw new ConflictException('Manual payment review is already resolved');
      }

      await tx.insert(auditEvents).values({
        actorType: 'admin',
        actorId: adminId,
        action: 'manual_payment_review_resolved',
        entityType: 'payment',
        entityId: paymentAttemptId,
        source: 'admin_payment_review_api',
        reason: note,
        metadata: {
          previousManualReviewReason: payment.manualReviewReason,
          previousManualReviewAt: payment.manualReviewAt?.toISOString() ?? null,
        },
      });

      return { paymentAttemptId: updated.id, reviewStatus: 'resolved' as const };
    });
  }
}
