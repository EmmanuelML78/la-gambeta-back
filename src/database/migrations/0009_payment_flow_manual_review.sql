CREATE TYPE "public"."payment_flow" AS ENUM('hosted_checkout', 'direct_card', 'legacy_unknown');--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "payment_flow" "payment_flow" DEFAULT 'legacy_unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "manual_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "manual_review_reason" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "manual_review_at" timestamp;--> statement-breakpoint
UPDATE "payments"
SET "manual_review" = true,
    "manual_review_reason" = 'Historical open payment attempt has unknown payment flow; reconcile before retrying',
    "manual_review_at" = CURRENT_TIMESTAMP
WHERE "payment_flow" = 'legacy_unknown'
  AND "status" IN ('pending', 'processing');--> statement-breakpoint
CREATE INDEX "payments_flow_status_idx" ON "payments" USING btree ("payment_flow","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "payments_manual_review_idx" ON "payments" USING btree ("manual_review","manual_review_at" DESC NULLS LAST,"id" DESC NULLS LAST);
