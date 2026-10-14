import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { is } from 'drizzle-orm';
import {
  getTableConfig,
  IndexedColumn,
  PgDialect,
  PgTable,
} from 'drizzle-orm/pg-core';
import {
  auditEvents,
  bookingStatusHistory,
  bookings,
  paymentEvents,
  payments,
  PaymentFlow,
} from './schema';
import { PaymentStatus } from '../common/enums';

type TableConfig = ReturnType<typeof getTableConfig>;

interface IndexDefinition {
  name: string;
  unique: boolean;
  columns: Array<{ name: string; order: 'asc' | 'desc' }>;
  predicate?: string;
}

interface PaymentUniquenessDefinition {
  bookingColumnIsUnique: boolean;
  uniqueConstraints: string[][];
  indexes: IndexDefinition[];
}

const dialect = new PgDialect();

function config(table: PgTable): TableConfig {
  return getTableConfig(table);
}

function normalizeSql(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function indexDefinitions(table: PgTable): IndexDefinition[] {
  return config(table).indexes.map((index) => {
    if (!index.config.name) {
      throw new Error('Expected a named index');
    }

    const columns = index.config.columns.map((column) => {
      if (!is(column, IndexedColumn) || !column.name) {
        throw new Error(`Index ${index.config.name} contains a SQL expression`);
      }
      return { name: column.name, order: column.indexConfig.order };
    });

    return {
      name: index.config.name,
      unique: index.config.unique,
      columns,
      predicate: index.config.where
        ? normalizeSql(dialect.sqlToQuery(index.config.where).sql)
        : undefined,
    };
  });
}

function indexByName(
  table: PgTable,
  name: string,
): IndexDefinition | undefined {
  return indexDefinitions(table).find((index) => index.name === name);
}

function paymentUniquenessDefinition(): PaymentUniquenessDefinition {
  const table = config(payments);
  const bookingColumn = table.columns.find(
    (column) => column.name === 'booking_id',
  );
  if (!bookingColumn) {
    throw new Error('payments.booking_id is missing');
  }

  return {
    bookingColumnIsUnique: bookingColumn.isUnique,
    uniqueConstraints: table.uniqueConstraints.map((constraint) =>
      constraint.columns.map((column) => column.name),
    ),
    indexes: indexDefinitions(payments),
  };
}

function hasForbiddenBookingUnique(
  definition: PaymentUniquenessDefinition,
): boolean {
  return (
    definition.bookingColumnIsUnique ||
    definition.uniqueConstraints.some(
      (columns) => columns.length === 1 && columns[0] === 'booking_id',
    ) ||
    definition.indexes.some(
      (index) =>
        index.unique &&
        index.predicate === undefined &&
        index.columns.length === 1 &&
        index.columns[0]?.name === 'booking_id',
    )
  );
}

function nullability(table: PgTable, columnNames: string[]) {
  const columns = config(table).columns;
  return Object.fromEntries(
    columnNames.map((name) => {
      const column = columns.find((candidate) => candidate.name === name);
      if (!column) {
        throw new Error(`Missing column ${name}`);
      }
      return [name, column.notNull];
    }),
  );
}

function prematurelyRequiredColumns(
  definition: Record<string, boolean>,
): string[] {
  return Object.entries(definition)
    .filter(([, notNull]) => notNull)
    .map(([name]) => name);
}

function matchesIndex(
  actual: IndexDefinition | undefined,
  expected: IndexDefinition,
): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

const APPEND_ONLY_TABLES = [
  'booking_status_history',
  'payment_events',
  'audit_events',
] as const;

function appendOnlyContractErrors(sql: string): string[] {
  const errors: string[] = [];
  const functionDefinition =
    /CREATE OR REPLACE FUNCTION "reject_append_only_mutation"\(\)\s+RETURNS trigger\s+LANGUAGE plpgsql\s+AS \$\$\s+BEGIN\s+RAISE EXCEPTION '[^']*append-only[^']*'[^;]*;\s+RETURN NULL;\s+END;\s+\$\$;/i;
  if (!functionDefinition.test(sql)) {
    errors.push('shared-function');
  }

  for (const table of APPEND_ONLY_TABLES) {
    const trigger = new RegExp(
      `CREATE TRIGGER "${table}_append_only"\\s+BEFORE UPDATE OR DELETE ON "${table}"\\s+FOR EACH ROW EXECUTE FUNCTION "reject_append_only_mutation"\\(\\);`,
      'i',
    );
    if (!trigger.test(sql)) {
      errors.push(table);
    }
  }
  return errors;
}

function foreignKeyDeleteAction(table: PgTable, columnName: string) {
  const foreignKey = config(table).foreignKeys.find((key) =>
    key.reference().columns.some((column) => column.name === columnName),
  );
  return foreignKey?.onDelete;
}

function migrationSql(): string {
  const migrationsDir = join(__dirname, 'migrations');
  const migration = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .reverse()
    .find((file) =>
      readFileSync(join(migrationsDir, file), 'utf8').includes(
        'booking_status_history',
      ),
    );

  if (!migration) {
    throw new Error('Phase 1B.3 migration was not generated');
  }
  return readFileSync(join(migrationsDir, migration), 'utf8');
}

function paymentFlowMigrationSql(): string {
  return readFileSync(join(__dirname, 'migrations', '0009_payment_flow_manual_review.sql'), 'utf8');
}

describe('transactional evidence schema', () => {
  it('defines payment flow and queryable manual-review state with legacy-safe defaults', () => {
    const columns = config(payments).columns;
    const byName = (name: string) => columns.find((column) => column.name === name);
    expect(byName('payment_flow')?.notNull).toBe(true);
    expect(byName('payment_flow')?.default).toBe(PaymentFlow.LEGACY_UNKNOWN);
    expect(byName('manual_review')?.notNull).toBe(true);
    expect(byName('manual_review')?.default).toBe(false);
    expect(byName('manual_review_reason')).toBeDefined();
    expect(byName('manual_review_at')).toBeDefined();
    expect(indexByName(payments, 'payments_flow_status_idx')).toBeDefined();
    expect(indexByName(payments, 'payments_manual_review_idx')).toBeDefined();
  });
  it('forbids unconditional booking uniqueness at column, constraint, and index level', () => {
    const definition = paymentUniquenessDefinition();
    expect(hasForbiddenBookingUnique(definition)).toBe(false);

    expect(
      hasForbiddenBookingUnique({
        ...definition,
        bookingColumnIsUnique: true,
      }),
    ).toBe(true);
    expect(
      hasForbiddenBookingUnique({
        ...definition,
        uniqueConstraints: [...definition.uniqueConstraints, ['booking_id']],
      }),
    ).toBe(true);
    expect(
      hasForbiddenBookingUnique({
        ...definition,
        indexes: [
          ...definition.indexes,
          {
            name: 'invalid_booking_unique',
            unique: true,
            columns: [{ name: 'booking_id', order: 'asc' }],
          },
        ],
      }),
    ).toBe(true);
  });

  it('keeps all Phase 1B.3 expansion columns nullable', () => {
    const paymentColumns = [
      'provider',
      'provider_checkout_id',
      'provider_payment_id',
      'idempotency_key',
      'checkout_url',
      'checkout_expires_at',
    ];
    const paymentNullability = nullability(payments, paymentColumns);
    const bookingNullability = nullability(bookings, ['hold_expires_at']);

    expect(prematurelyRequiredColumns(paymentNullability)).toEqual([]);
    expect(prematurelyRequiredColumns(bookingNullability)).toEqual([]);
    expect(
      prematurelyRequiredColumns({
        ...paymentNullability,
        provider: true,
      }),
    ).toEqual(['provider']);
    expect(
      prematurelyRequiredColumns({
        ...bookingNullability,
        hold_expires_at: true,
      }),
    ).toEqual(['hold_expires_at']);
  });

  it('matches every critical index column, order, uniqueness, and predicate', () => {
    const expectedIndexes: Array<{
      table: PgTable;
      definition: IndexDefinition;
    }> = [
      {
        table: payments,
        definition: {
          name: 'payments_booking_idempotency_unique',
          unique: true,
          columns: [
            { name: 'booking_id', order: 'asc' },
            { name: 'idempotency_key', order: 'asc' },
          ],
        },
      },
      {
        table: payments,
        definition: {
          name: 'payments_provider_checkout_unique',
          unique: true,
          columns: [
            { name: 'provider', order: 'asc' },
            { name: 'provider_checkout_id', order: 'asc' },
          ],
          predicate: '"payments"."provider_checkout_id" is not null',
        },
      },
      {
        table: payments,
        definition: {
          name: 'payments_provider_payment_unique',
          unique: true,
          columns: [
            { name: 'provider', order: 'asc' },
            { name: 'provider_payment_id', order: 'asc' },
          ],
          predicate: '"payments"."provider_payment_id" is not null',
        },
      },
      {
        table: payments,
        definition: {
          name: 'payments_booking_created_id_idx',
          unique: false,
          columns: [
            { name: 'booking_id', order: 'asc' },
            { name: 'created_at', order: 'desc' },
            { name: 'id', order: 'desc' },
          ],
        },
      },
      {
        table: payments,
        definition: {
          name: 'payments_open_attempt_unique',
          unique: true,
          columns: [{ name: 'booking_id', order: 'asc' }],
          predicate: `"payments"."status" in ('pending', 'processing')`,
        },
      },
      {
        table: paymentEvents,
        definition: {
          name: 'payment_events_provider_event_unique',
          unique: true,
          columns: [
            { name: 'provider', order: 'asc' },
            { name: 'provider_event_id', order: 'asc' },
          ],
        },
      },
    ];

    for (const { table, definition } of expectedIndexes) {
      expect(indexByName(table, definition.name)).toEqual(definition);
    }

    const deterministic = expectedIndexes[3].definition;
    expect(
      matchesIndex(
        { ...deterministic, columns: [...deterministic.columns].reverse() },
        deterministic,
      ),
    ).toBe(false);
    expect(
      matchesIndex(
        {
          ...deterministic,
          columns: deterministic.columns.map((column) =>
            column.name === 'created_at' ? { ...column, order: 'asc' } : column,
          ),
        },
        deterministic,
      ),
    ).toBe(false);

    const openAttempt = expectedIndexes[4].definition;
    expect(
      matchesIndex(
        { ...openAttempt, predicate: `"payments"."status" = 'pending'` },
        openAttempt,
      ),
    ).toBe(false);

    const providerEvent = expectedIndexes[5].definition;
    expect(
      matchesIndex(
        {
          ...providerEvent,
          columns: [{ name: 'provider_event_id', order: 'asc' }],
        },
        providerEvent,
      ),
    ).toBe(false);

    const providerCheckout = expectedIndexes[1].definition;
    expect(
      matchesIndex(
        {
          ...providerCheckout,
          predicate: '"payments"."provider" is not null',
        },
        providerCheckout,
      ),
    ).toBe(false);
  });

  it('retains legacy provider columns during the expansion', () => {
    expect(config(payments).columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(['mp_payment_id', 'mp_preference_id']),
    );
  });

  it('defines append-only history and audit tables with evidence metadata', () => {
    for (const table of [bookingStatusHistory, paymentEvents, auditEvents]) {
      expect(config(table).columns.map((column) => column.name)).toEqual(
        expect.arrayContaining([
          'actor_type',
          'actor_id',
          'source',
          'reason',
          'correlation_id',
          'metadata',
          'created_at',
        ]),
      );
    }
  });

  it('uses RESTRICT for transactional evidence ownership', () => {
    expect(foreignKeyDeleteAction(bookings, 'user_id')).toBe('restrict');
    expect(foreignKeyDeleteAction(payments, 'booking_id')).toBe('restrict');
    expect(foreignKeyDeleteAction(bookingStatusHistory, 'booking_id')).toBe(
      'restrict',
    );
    expect(foreignKeyDeleteAction(paymentEvents, 'payment_id')).toBe(
      'restrict',
    );
    expect(foreignKeyDeleteAction(paymentEvents, 'booking_id')).toBe(
      'restrict',
    );
  });
});

describe('payment flow/manual review forward migration', () => {
  it('adds flow and review columns after 0008 with historical rows defaulting to legacy_unknown', () => {
    const sql = paymentFlowMigrationSql();
    expect(sql).toMatch(/CREATE TYPE "public"\."payment_flow" AS ENUM\('hosted_checkout', 'direct_card', 'legacy_unknown'\)/);
    expect(sql).toMatch(/ADD COLUMN "payment_flow" "payment_flow" DEFAULT 'legacy_unknown' NOT NULL/);
    expect(sql).toMatch(/ADD COLUMN "manual_review" boolean DEFAULT false NOT NULL/);
    expect(sql).toContain('ADD COLUMN "manual_review_reason" text');
    expect(sql).toContain('ADD COLUMN "manual_review_at" timestamp');
    expect(sql).toContain('CREATE INDEX "payments_flow_status_idx"');
    expect(sql).toContain('CREATE INDEX "payments_manual_review_idx"');
    const journal = JSON.parse(readFileSync(join(__dirname, 'migrations', 'meta', '_journal.json'), 'utf8'));
    expect(journal.entries.slice(-2).map((entry: { idx: number; tag: string }) => [entry.idx, entry.tag])).toEqual([
      [8, '0008_sleepy_karnak'],
      [9, '0009_payment_flow_manual_review'],
    ]);
  });

  it('statically flags historical open legacy-flow attempts without changing terminal rows', () => {
    const sql = paymentFlowMigrationSql();
    const openStatuses = [PaymentStatus.PENDING, PaymentStatus.PROCESSING];
    expect(openStatuses).toEqual(['pending', 'processing']);
    expect(sql).toMatch(
      /UPDATE "payments"\s+SET "manual_review" = true,\s+"manual_review_reason" = 'Historical open payment attempt has unknown payment flow; reconcile before retrying',\s+"manual_review_at" = CURRENT_TIMESTAMP\s+WHERE "payment_flow" = 'legacy_unknown'\s+AND "status" IN \('pending', 'processing'\);/i,
    );
    expect(sql).not.toMatch(
      /WHERE[^;]*"status" IN \([^)]*'succeeded'|WHERE[^;]*"status" IN \([^)]*'failed'/i,
    );
  });
});

describe('Phase 1B.3 expand/backfill migration', () => {
  const sql = migrationSql;

  it('fails closed on historical currency outside exact COP casing variants', () => {
    expect(sql()).toMatch(/currency" NOT IN \('COP', 'cop'\)/);
    expect(sql()).toMatch(
      /RAISE EXCEPTION[^;]*unsupported historical currency/is,
    );
    expect(sql()).toMatch(
      /UPDATE "payments"\s+SET "currency" = 'COP'\s+WHERE "currency" = 'cop'/i,
    );
  });

  it('backfills generic legacy references without relabeling provider history', () => {
    expect(sql()).toContain(`"provider" = 'legacy'`);
    expect(sql()).toMatch(/"idempotency_key" = 'legacy:' \|\| "id"::text/);
    expect(sql()).toMatch(/"provider_checkout_id" = "mp_preference_id"/);
    expect(sql()).toMatch(/"provider_payment_id" = "mp_payment_id"/);
    expect(sql()).not.toMatch(/UPDATE "bookings"[\s\S]*SET "status"/i);
    expect(sql()).not.toMatch(/UPDATE "payments"[\s\S]*SET "status"/i);
  });

  it('seeds initial booking/payment state evidence from NULL with migration source', () => {
    expect(sql()).toMatch(
      /INSERT INTO "booking_status_history"[\s\S]*NULL[\s\S]*'migration'/i,
    );
    expect(sql()).toMatch(
      /INSERT INTO "payment_events"[\s\S]*NULL[\s\S]*'migration'/i,
    );
  });

  it('creates required unique, partial, deterministic, and restrictive structures', () => {
    const migration = sql();
    expect(migration).not.toMatch(/\$\d+/);
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "payments_booking_idempotency_unique" ON "payments" USING btree ("booking_id","idempotency_key");',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "payments_provider_checkout_unique" ON "payments" USING btree ("provider","provider_checkout_id") WHERE "payments"."provider_checkout_id" is not null;',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "payments_provider_payment_unique" ON "payments" USING btree ("provider","provider_payment_id") WHERE "payments"."provider_payment_id" is not null;',
    );
    expect(migration).toContain(
      'CREATE INDEX "payments_booking_created_id_idx" ON "payments" USING btree ("booking_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);',
    );
    expect(migration).toContain(
      `CREATE UNIQUE INDEX "payments_open_attempt_unique" ON "payments" USING btree ("booking_id") WHERE "payments"."status" in ('pending', 'processing');`,
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "payment_events_provider_event_unique" ON "payment_events" USING btree ("provider","provider_event_id");',
    );
    expect(migration).toMatch(/ON DELETE restrict/gi);
  });

  it('installs the exact shared append-only function and three row triggers', () => {
    const migration = sql();
    expect(appendOnlyContractErrors(migration)).toEqual([]);
  });

  it('rejects weakened trigger timing, events, and function bindings', () => {
    const migration = sql();
    expect(
      appendOnlyContractErrors(
        migration.replace(
          'BEFORE UPDATE OR DELETE ON "booking_status_history"',
          'BEFORE UPDATE ON "booking_status_history"',
        ),
      ),
    ).toContain('booking_status_history');
    expect(
      appendOnlyContractErrors(
        migration.replace(
          'FOR EACH ROW EXECUTE FUNCTION "reject_append_only_mutation"();',
          'FOR EACH ROW EXECUTE FUNCTION "incorrect_append_only_function"();',
        ),
      ),
    ).toContain('booking_status_history');
    expect(
      appendOnlyContractErrors(
        migration.replace(
          "RAISE EXCEPTION 'Table % is append-only",
          "RAISE NOTICE 'Table % is append-only",
        ),
      ),
    ).toContain('shared-function');
  });
});
