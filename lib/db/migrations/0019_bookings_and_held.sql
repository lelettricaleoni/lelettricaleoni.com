CREATE TYPE "public"."booking_status" AS ENUM('pending', 'confirmed', 'cancelled', 'expired', 'failed_refunded');--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"status" "booking_status" DEFAULT 'pending' NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"total_cents" integer NOT NULL,
	"language" text DEFAULT 'it' NOT NULL,
	"stripe_session_id" text,
	"stripe_payment_intent_id" text,
	"hold_expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"confirmed_at" timestamp,
	CONSTRAINT "bookings_request_key_unique" UNIQUE("request_key"),
	CONSTRAINT "bookings_stripe_session_id_unique" UNIQUE("stripe_session_id")
);
--> statement-breakpoint
ALTER TABLE "bike_reservations" ADD COLUMN "booking_id" uuid;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_customer_idx" ON "bookings" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "bookings_status_expires_idx" ON "bookings" USING btree ("status","hold_expires_at");--> statement-breakpoint
ALTER TABLE "bike_reservations" ADD CONSTRAINT "bike_reservations_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bike_reservations_booking_idx" ON "bike_reservations" USING btree ("booking_id");
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_range_check" CHECK ("ends_on" > "starts_on");
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_total_check" CHECK ("total_cents" >= 0);
--> statement-breakpoint
-- Explicit, not left to the ensure_rls event trigger: development and Preview do not have it.
-- No policies on purpose: the app connects as `postgres`, which bypasses RLS.
ALTER TABLE "bookings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- A bike being paid for blocks the bike as a confirmed one does.
ALTER TABLE "bike_reservations" DROP CONSTRAINT "bike_reservations_no_overlap";
--> statement-breakpoint
ALTER TABLE "bike_reservations" ADD CONSTRAINT "bike_reservations_no_overlap" EXCLUDE USING gist ("bike_unit_id" extensions.gist_uuid_ops WITH =, "during" WITH &&) WHERE ("status" IN ('confirmed', 'held'));
--> statement-breakpoint
-- An online rental has a customer and a booking; nothing else has a booking.
ALTER TABLE "bike_reservations" ADD CONSTRAINT "bike_reservations_online_has_booking" CHECK (
  ("kind" = 'online_rental' AND "booking_id" IS NOT NULL AND "customer_id" IS NOT NULL)
  OR ("kind" <> 'online_rental' AND "booking_id" IS NULL)
);
