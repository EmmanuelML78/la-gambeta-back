CREATE TYPE "public"."contact_request_status" AS ENUM('NEW', 'IN_PROGRESS', 'RESOLVED');--> statement-breakpoint
CREATE TYPE "public"."contact_requester_type" AS ENUM('PLAYER', 'VENUE_OWNER', 'CONTRACTOR', 'OTHER');--> statement-breakpoint
CREATE TABLE "contact_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_type" "contact_requester_type" NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"organization" text,
	"message" text NOT NULL,
	"status" "contact_request_status" DEFAULT 'NEW' NOT NULL,
	"privacy_accepted_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "contact_requests_status_created_idx" ON "contact_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "contact_requests_requester_type_idx" ON "contact_requests" USING btree ("requester_type");