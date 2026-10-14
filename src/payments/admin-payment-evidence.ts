import { PaymentStatus } from '../common/enums';
import {
  EVIDENCE_REASON_CODES,
  EVIDENCE_SOURCES,
} from '../transactional-evidence/evidence-contract';
import type {
  EvidenceReasonCode,
  EvidenceSource,
} from '../transactional-evidence/evidence-contract';
import { LATE_PAYMENT_RECONCILIATION_ACTION } from './payment-reconciliation.constants';

export const LEGACY_LATE_PAYMENT_RECONCILIATION_ACTION =
  'late_payment_requires_reconciliation' as const;

export type AdminPaymentEvidenceActor = 'user' | 'admin' | 'system' | 'provider';
export type AdminPaymentEvidenceSource = EvidenceSource | 'migration';
export type AdminPaymentAuditAction =
  | typeof LATE_PAYMENT_RECONCILIATION_ACTION
  | typeof LEGACY_LATE_PAYMENT_RECONCILIATION_ACTION;

export interface AdminPaymentEventProjection {
  id: string;
  fromStatus: PaymentStatus | null;
  toStatus: PaymentStatus;
  actorType: AdminPaymentEvidenceActor;
  source: AdminPaymentEvidenceSource | null;
  reasonCode: EvidenceReasonCode | null;
  createdAt: Date;
}

export interface AdminPaymentAuditProjection {
  id: string;
  action: AdminPaymentAuditAction;
  actorType: AdminPaymentEvidenceActor;
  source: AdminPaymentEvidenceSource | null;
  reasonCode: EvidenceReasonCode | null;
  createdAt: Date;
}

interface AdminPaymentEvidenceRow {
  id: string;
  actorType: string;
  source: string;
  reason: string | null;
  createdAt: Date;
  actorId?: unknown;
  metadata?: unknown;
}

export interface AdminPaymentEventRow extends AdminPaymentEvidenceRow {
  fromStatus: PaymentStatus | null;
  toStatus: PaymentStatus;
}

export interface AdminPaymentAuditRow extends AdminPaymentEvidenceRow {
  action: string;
}

const SAFE_SOURCES = new Set<string>([...EVIDENCE_SOURCES, 'migration']);
const SAFE_REASONS = new Set<string>(EVIDENCE_REASON_CODES);
const SAFE_ACTORS = new Set<AdminPaymentEvidenceActor>([
  'user',
  'admin',
  'system',
  'provider',
]);
const SAFE_AUDIT_ACTIONS = new Set<string>([
  LATE_PAYMENT_RECONCILIATION_ACTION,
  LEGACY_LATE_PAYMENT_RECONCILIATION_ACTION,
]);

function safeActor(value: string): AdminPaymentEvidenceActor {
  return SAFE_ACTORS.has(value as AdminPaymentEvidenceActor)
    ? (value as AdminPaymentEvidenceActor)
    : 'system';
}

function safeSource(value: string): AdminPaymentEvidenceSource | null {
  return SAFE_SOURCES.has(value) ? (value as AdminPaymentEvidenceSource) : null;
}

function safeReason(value: string | null): EvidenceReasonCode | null {
  return value && SAFE_REASONS.has(value) ? (value as EvidenceReasonCode) : null;
}

export function projectSafeAdminPaymentEvent(
  row: AdminPaymentEventRow,
): AdminPaymentEventProjection {
  return {
    id: row.id,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    actorType: safeActor(row.actorType),
    source: safeSource(row.source),
    reasonCode: safeReason(row.reason),
    createdAt: row.createdAt,
  };
}

export function projectSafeAdminPaymentAudit(
  row: AdminPaymentAuditRow,
): AdminPaymentAuditProjection | null {
  if (!SAFE_AUDIT_ACTIONS.has(row.action)) return null;
  return {
    id: row.id,
    action: row.action as AdminPaymentAuditAction,
    actorType: safeActor(row.actorType),
    source: safeSource(row.source),
    reasonCode: safeReason(row.reason),
    createdAt: row.createdAt,
  };
}
