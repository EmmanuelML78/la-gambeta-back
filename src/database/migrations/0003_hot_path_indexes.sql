-- Índices en columnas calientes. Antes: cero índices -> full scan en cada query
-- de disponibilidad, "mis reservas" y lookup de pago.
--
-- NOTA prod: para tablas grandes con tráfico, usar CREATE INDEX CONCURRENTLY
-- (no bloquea escrituras) fuera de una transacción. Acá va plano porque las
-- migraciones de Drizzle corren en transacción y las tablas aún son chicas.
CREATE INDEX IF NOT EXISTS "bookings_court_date_idx" ON "bookings" ("court_id", "booking_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_user_idx" ON "bookings" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_status_idx" ON "bookings" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_booking_idx" ON "payments" ("booking_id");
