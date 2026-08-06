CREATE TABLE "venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"city" text,
	"phone" text,
	"latitude" numeric(10, 8),
	"longitude" numeric(11, 8),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "courts" ADD COLUMN "venue_id" uuid;--> statement-breakpoint
ALTER TABLE "courts" ADD CONSTRAINT "courts_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;
-- Los CREATE INDEX que drizzle generó acá se borraron a mano: los cuatro
-- índices ya los crea 0003_hot_path_indexes.sql, que fue escrita a mano y
-- nunca entró al snapshot. Dejarlos rompía la migración tanto en una base
-- existente como en una fresca. El snapshot de 0004 ya los incluye, así que
-- los `db:generate` futuros no los vuelven a emitir.
