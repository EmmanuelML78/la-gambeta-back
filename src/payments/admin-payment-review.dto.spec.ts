import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AdminPaymentReviewQueryDto, ResolveAdminPaymentReviewDto } from './dto/admin-payment-review.dto';

describe('admin payment-review DTO validation', () => {
  it('bounds pagination and requires a nonblank resolution note', () => {
    const query = plainToInstance(AdminPaymentReviewQueryDto, { page: '2', limit: '101' });
    const blankNote = plainToInstance(ResolveAdminPaymentReviewDto, { note: '   ' });
    const validNote = plainToInstance(ResolveAdminPaymentReviewDto, { note: '  Reconciled  ' });

    expect(query.page).toBe(2);
    expect(validateSync(query).some((error) => error.property === 'limit')).toBe(true);
    expect(validateSync(blankNote).some((error) => error.property === 'note')).toBe(true);
    expect(validNote.note).toBe('Reconciled');
    expect(validateSync(validNote)).toHaveLength(0);
  });
});
