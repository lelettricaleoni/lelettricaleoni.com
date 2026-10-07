ALTER TABLE "bike_models" ADD COLUMN "price_adjustment_percent" numeric(5, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
-- A discount cannot reach 100 %, and nothing above +300 % is a price anyone meant: refused here, not only in the form.
ALTER TABLE "bike_models" ADD CONSTRAINT "bike_models_price_adjustment_check" CHECK ("price_adjustment_percent" > -100 AND "price_adjustment_percent" <= 300);
