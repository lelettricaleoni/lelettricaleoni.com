CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customers_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "bike_reservations" ADD COLUMN "customer_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "customers_email_unique" ON "customers" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_phone_unique" ON "customers" USING btree ("phone");--> statement-breakpoint
ALTER TABLE "bike_reservations" ADD CONSTRAINT "bike_reservations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bike_reservations_customer_idx" ON "bike_reservations" USING btree ("customer_id");
--> statement-breakpoint
-- Explicit RLS, as in 0010: development and Preview have no ensure_rls event trigger. No policies on
-- purpose: the app connects as `postgres`, which bypasses RLS, and these are personal data.
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Rentals entered before this had a single free-text name and no customer to point at. Kevin chose to
-- drop them rather than invent customers (2026-10-02); production had none at that moment.
-- Maintenance rows are not touched.
DELETE FROM "bike_reservations" WHERE "kind" = 'counter_rental';
--> statement-breakpoint
ALTER TABLE "bike_reservations" ADD CONSTRAINT "bike_reservations_rental_has_customer" CHECK ("kind" <> 'counter_rental' OR "customer_id" IS NOT NULL);
