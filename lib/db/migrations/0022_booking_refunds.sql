CREATE TYPE "public"."refund_reason" AS ENUM('customer', 'staff', 'late_payment');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('pending', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "booking_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" "refund_status" DEFAULT 'pending' NOT NULL,
	"gateway_refund_id" text,
	"reason" "refund_reason" NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_refunds_reservation_id_unique" UNIQUE("reservation_id")
);
--> statement-breakpoint
ALTER TABLE "booking_refunds" ADD CONSTRAINT "booking_refunds_reservation_id_bike_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."bike_reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_refunds" ADD CONSTRAINT "booking_refunds_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_refunds_booking_idx" ON "booking_refunds" USING btree ("booking_id");
--> statement-breakpoint
ALTER TABLE "booking_refunds" ADD CONSTRAINT "booking_refunds_amount_check" CHECK ("amount_cents" > 0);
--> statement-breakpoint
-- Explicit, not left to the ensure_rls event trigger: development and Preview do not have it.
-- No policies on purpose: the app connects as `postgres`, which bypasses RLS.
ALTER TABLE "booking_refunds" ENABLE ROW LEVEL SECURITY;
