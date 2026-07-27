-- Candado anti-doble-booking a nivel base de datos.
-- El chequeo de disponibilidad en la app es check-then-insert (TOCTOU): bajo
-- concurrencia, dos requests simultáneos pueden colar el mismo turno. Este
-- EXCLUDE constraint hace que Postgres RECHACE atomicamente cualquier solapamiento
-- de horario en la misma cancha, para reservas que "ocupan" el turno.
--
-- Postgres exige que la expresión del índice sea IMMUTABLE: por eso el rango se
-- construye en una función IMMUTABLE (los casts inline dan "must be marked IMMUTABLE").
-- tsrange usa bounds [) -> turnos pegados (14-15, 15-16) NO chocan; los solapes sí.
--
-- NOTA: Drizzle no modela EXCLUDE en schema.ts. Aplicar SIEMPRE con `db:migrate`,
-- NUNCA con `db:push` (push introspecta y podría dropear este constraint).
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION booking_slot(bd timestamp, st text, et text)
RETURNS tsrange LANGUAGE sql IMMUTABLE AS $$
  SELECT tsrange(bd::date + st::time, bd::date + et::time)
$$;
--> statement-breakpoint
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist (
    "court_id" WITH =,
    booking_slot("booking_date", "start_time", "end_time") WITH &&
  )
  WHERE ("status" IN ('pending', 'confirmed', 'active'));
