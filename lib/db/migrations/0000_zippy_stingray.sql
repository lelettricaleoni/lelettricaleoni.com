CREATE TYPE "public"."difficulty" AS ENUM('easy', 'medium', 'hard', 'expert');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('it', 'en', 'de');--> statement-breakpoint
CREATE TYPE "public"."surface" AS ENUM('asphalt', 'dirt', 'mixed');--> statement-breakpoint
CREATE TABLE "route_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"alt_text" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" uuid NOT NULL,
	"locale" "locale" NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"start_point_label" text,
	"is_auto_translated" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"difficulty" "difficulty" NOT NULL,
	"distance_km" numeric(6, 2),
	"elevation_m" integer,
	"duration_min" integer,
	"surface" "surface" DEFAULT 'mixed' NOT NULL,
	"bike_types" text[] DEFAULT '{}' NOT NULL,
	"strava_url" text,
	"komoot_url" text,
	"gpx_key" text,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "routes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "route_photos" ADD CONSTRAINT "route_photos_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_translations" ADD CONSTRAINT "route_translations_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "route_photos_route_idx" ON "route_photos" USING btree ("route_id");--> statement-breakpoint
CREATE INDEX "route_translations_route_locale_idx" ON "route_translations" USING btree ("route_id","locale");--> statement-breakpoint
CREATE INDEX "routes_slug_idx" ON "routes" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "routes_published_idx" ON "routes" USING btree ("is_published");