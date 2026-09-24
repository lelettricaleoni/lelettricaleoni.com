CREATE TABLE "route_bike_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "route_bike_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "bike_categories" ADD COLUMN "route_category_id" uuid;--> statement-breakpoint
ALTER TABLE "bike_categories" ADD CONSTRAINT "bike_categories_route_category_id_route_bike_categories_id_fk" FOREIGN KEY ("route_category_id") REFERENCES "public"."route_bike_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "route_bike_categories" ("name", "display_order") VALUES
	('eMTB', 0),
	('MTB', 1),
	('Gravel', 2),
	('E-Gravel', 3),
	('E-City Bike', 4);--> statement-breakpoint
UPDATE "bike_categories" SET "route_category_id" = (SELECT "id" FROM "route_bike_categories" WHERE "name" = 'eMTB')
	WHERE "name" IN ('eMTB Front', 'eMTB Full • Alu', 'eMTB Full • Carbon');--> statement-breakpoint
UPDATE "bike_categories" SET "route_category_id" = (SELECT "id" FROM "route_bike_categories" WHERE "name" = 'Gravel')
	WHERE "name" = 'Gravel';--> statement-breakpoint
UPDATE "bike_categories" SET "route_category_id" = (SELECT "id" FROM "route_bike_categories" WHERE "name" = 'MTB')
	WHERE "name" = 'MTB';--> statement-breakpoint
UPDATE "bike_categories" SET "route_category_id" = (SELECT "id" FROM "route_bike_categories" WHERE "name" = 'E-City Bike')
	WHERE "name" = 'City eBike';
