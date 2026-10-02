CREATE TYPE "public"."reservation_kind" AS ENUM('counter_rental', 'maintenance');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('confirmed', 'cancelled');--> statement-breakpoint
CREATE TABLE "bike_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bike_unit_id" uuid NOT NULL,
	"kind" "reservation_kind" NOT NULL,
	"status" "reservation_status" DEFAULT 'confirmed' NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"label" text,
	"request_key" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bike_reservations_request_key_unique" UNIQUE("request_key")
);
--> statement-breakpoint
ALTER TABLE "bike_reservations" ADD CONSTRAINT "bike_reservations_bike_unit_id_bike_units_id_fk" FOREIGN KEY ("bike_unit_id") REFERENCES "public"."bike_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bike_reservations_unit_starts_idx" ON "bike_reservations" USING btree ("bike_unit_id","starts_on");
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
--> statement-breakpoint
ALTER TABLE "bike_reservations" ADD COLUMN "during" daterange GENERATED ALWAYS AS (daterange("starts_on", "ends_on", '[)')) STORED;
--> statement-breakpoint
ALTER TABLE "bike_reservations" ADD CONSTRAINT "bike_reservations_no_overlap" EXCLUDE USING gist ("bike_unit_id" extensions.gist_uuid_ops WITH =, "during" WITH &&) WHERE ("status" = 'confirmed');
--> statement-breakpoint
ALTER TABLE "bike_reservations" ADD CONSTRAINT "bike_reservations_range_check" CHECK ("ends_on" > "starts_on");
--> statement-breakpoint
-- Explicit, not left to the ensure_rls event trigger: production has it, development and
-- Preview do not, and a table born open there is reachable with the anon key through PostgREST.
-- No policies on purpose: the app connects as `postgres`, which bypasses RLS.
ALTER TABLE "bike_reservations" ENABLE ROW LEVEL SECURITY;
