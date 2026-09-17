CREATE TYPE "public"."bike_pricing_mode" AS ENUM('table', 'linear');--> statement-breakpoint
CREATE TABLE "bike_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"max_rental_days" integer NOT NULL,
	"pricing_mode" "bike_pricing_mode" DEFAULT 'table' NOT NULL,
	"day1_price" numeric NOT NULL,
	"day2_price" numeric,
	"day3_price" numeric,
	"day4_price" numeric,
	"day5_price" numeric,
	"day6_price" numeric,
	"day7_price" numeric,
	"per_day_after_price" numeric,
	"afternoon_price" numeric
);
--> statement-breakpoint
CREATE TABLE "bike_sizes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bike_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL
);
