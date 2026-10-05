ALTER TABLE "bike_reservations" ADD COLUMN "amount_cents" integer;--> statement-breakpoint
-- A rental has a price, a maintenance has none; a price is never negative.
ALTER TABLE "bike_reservations" ADD CONSTRAINT "bike_reservations_amount_check" CHECK ("amount_cents" IS NULL OR "amount_cents" >= 0);
