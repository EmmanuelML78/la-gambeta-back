import { PaymentStatus } from '../common/enums';
import {
  EVIDENCE_REASON_CODES,
  EVIDENCE_SOURCES,
} from '../transactional-evidence/evidence-contract';
import { LATE_PAYMENT_RECONCILIATION_ACTION } from './payment-reconciliation.constants';
import {
  LEGACY_LATE_PAYMENT_RECONCILIATION_ACTION,
  projectSafeAdminPaymentAudit,
  projectSafeAdminPaymentEvent,
} from './admin-payment-evidence';

describe('admin payment evidence projection', () => {
  const createdAt = new Date('2026-09-10T12:00:00.000Z');

  it('projects only explicit event fields and recognized vocabulary', () => {
    const result = projectSafeAdminPaymentEvent({
      id: 'event-1',
      fromStatus: PaymentStatus.PROCESSING,
      toStatus: PaymentStatus.SUCCEEDED,
      actorType: 'provider',
      source: 'migration',
      reason: 'payment_succeeded',
      createdAt,
      actorId: 'user@example.com',
      metadata: { rawPayload: 'bearer secret', extra: true },
    });

    expect(result).toEqual({
      id: 'event-1',
      fromStatus: PaymentStatus.PROCESSING,
      toStatus: PaymentStatus.SUCCEEDED,
      actorType: 'provider',
      source: 'migration',
      reasonCode: 'payment_succeeded',
      createdAt,
    });
    expect(result).not.toHaveProperty('actorId');
    expect(result).not.toHaveProperty('metadata');
  });

  it('normalizes unknown event actor, source, and reason values', () => {
    expect(
      projectSafeAdminPaymentEvent({
        id: 'event-2',
        fromStatus: null,
        toStatus: PaymentStatus.FAILED,
        actorType: 'customer@example.com',
        source: 'request-body',
        reason: 'password-leaked',
        createdAt,
      }),
    ).toMatchObject({
      actorType: 'system',
      source: null,
      reasonCode: null,
    });
  });

  it.each([
    LATE_PAYMENT_RECONCILIATION_ACTION,
    LEGACY_LATE_PAYMENT_RECONCILIATION_ACTION,
  ])('projects recognized reconciliation action %s', (action) => {
    expect(
      projectSafeAdminPaymentAudit({
        id: 'audit-1',
        action,
        actorType: 'system',
        source: 'webhook',
        reason: 'late_payment_requires_reconciliation',
        createdAt,
        metadata: { cardToken: 'sensitive' },
      }),
    ).toEqual({
      id: 'audit-1',
      action,
      actorType: 'system',
      source: 'webhook',
      reasonCode: 'late_payment_requires_reconciliation',
      createdAt,
    });
  });

  it('drops unknown audit actions and does not expose metadata', () => {
    const audit = projectSafeAdminPaymentAudit({
      id: 'audit-2',
      action: 'customer_refund_requested',
      actorType: 'admin',
      source: 'admin_booking_api',
      reason: null,
      createdAt,
      metadata: { email: 'customer@example.com', payload: 'raw' },
    });
    expect(audit).toBeNull();
  });

  it('uses the shared source and reason vocabularies', () => {
    expect(EVIDENCE_SOURCES).toContain('payment_provider');
    expect(EVIDENCE_REASON_CODES).toContain('payment_succeeded');
  });
});
