DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "payments"
		WHERE "currency" NOT IN ('COP', 'cop')
	) THEN
		RAISE EXCEPTION 'Phase 1B.3 aborted: unsupported historical currency found in payments';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "payments"
		WHERE "status" IN ('pending', 'processing')
		GROUP BY "booking_id"
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION 'Phase 1B.3 aborted: multiple open payment attempts found for a booking';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "payments"
		WHERE "mp_preference_id" IS NOT NULL
		GROUP BY "mp_preference_id"
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION 'Phase 1B.3 aborted: duplicate legacy checkout references found';
	END IF;
END;
$$;
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"source" text NOT NULL,
	"reason" text,
	"correlation_id" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"from_status" "booking_status",
	"to_status" "booking_status" NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"source" text NOT NULL,
	"reason" text,
	"correlation_id" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"from_status" "payment_status",
	"to_status" "payment_status" NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"source" text NOT NULL,
	"reason" text,
	"correlation_id" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_booking_id_bookings_id_fk";
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "hold_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "provider_checkout_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "provider_payment_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "checkout_url" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "checkout_expires_at" timestamp;--> statement-breakpoint
UPDATE "payments"
SET "currency" = 'COP'
WHERE "currency" = 'cop';
--> statement-breakpoint
UPDATE "payments"
SET
	"provider" = 'legacy',
	"provider_checkout_id" = "mp_preference_id",
	"provider_payment_id" = "mp_payment_id",
	"idempotency_key" = 'legacy:' || "id"::text;
--> statement-breakpoint
INSERT INTO "booking_status_history" (
	"booking_id",
	"from_status",
	"to_status",
	"actor_type",
	"actor_id",
	"source",
	"reason",
	"correlation_id",
	"metadata",
	"created_at"
)
SELECT
	b."id",
	NULL,
	b."status",
	'system',
	NULL,
	'migration',
	'Initial booking state captured during Phase 1B.3 expansion',
	'migration:phase-1b.3',
	jsonb_build_object('schemaVersion', 1),
	b."created_at"
FROM "bookings" b;
--> statement-breakpoint
INSERT INTO "payment_events" (
	"payment_id",
	"booking_id",
	"provider",
	"provider_event_id",
	"from_status",
	"to_status",
	"actor_type",
	"actor_id",
	"source",
	"reason",
	"correlation_id",
	"metadata",
	"created_at"
)
SELECT
	p."id",
	p."booking_id",
	p."provider",
	'migration:' || p."id"::text,
	NULL,
	p."status",
	'system',
	NULL,
	'migration',
	'Initial payment state captured during Phase 1B.3 expansion',
	'migration:phase-1b.3',
	jsonb_build_object('schemaVersion', 1),
	p."created_at"
FROM "payments" p;
--> statement-breakpoint
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_entity_created_idx" ON "audit_events" USING btree ("entity_type","entity_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_events_actor_created_idx" ON "audit_events" USING btree ("actor_type","actor_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_events_correlation_idx" ON "audit_events" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "booking_status_history_booking_created_idx" ON "booking_status_history" USING btree ("booking_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "booking_status_history_correlation_idx" ON "booking_status_history" USING btree ("correlation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_provider_event_unique" ON "payment_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "payment_events_payment_created_idx" ON "payment_events" USING btree ("payment_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "payment_events_booking_created_idx" ON "payment_events" USING btree ("booking_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "payment_events_correlation_idx" ON "payment_events" USING btree ("correlation_id");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_booking_idempotency_unique" ON "payments" USING btree ("booking_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_checkout_unique" ON "payments" USING btree ("provider","provider_checkout_id") WHERE "payments"."provider_checkout_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_payment_unique" ON "payments" USING btree ("provider","provider_payment_id") WHERE "payments"."provider_payment_id" is not null;--> statement-breakpoint
CREATE INDEX "payments_booking_created_id_idx" ON "payments" USING btree ("booking_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "payments_open_attempt_unique" ON "payments" USING btree ("booking_id") WHERE "payments"."status" in ('pending', 'processing');
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "reject_append_only_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'Table % is append-only; % is not allowed', TG_TABLE_NAME, TG_OP;
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "booking_status_history_append_only"
BEFORE UPDATE OR DELETE ON "booking_status_history"
FOR EACH ROW EXECUTE FUNCTION "reject_append_only_mutation"();
--> statement-breakpoint
CREATE TRIGGER "payment_events_append_only"
BEFORE UPDATE OR DELETE ON "payment_events"
FOR EACH ROW EXECUTE FUNCTION "reject_append_only_mutation"();
--> statement-breakpoint
CREATE TRIGGER "audit_events_append_only"
BEFORE UPDATE OR DELETE ON "audit_events"
FOR EACH ROW EXECUTE FUNCTION "reject_append_only_mutation"();
