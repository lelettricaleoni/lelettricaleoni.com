CREATE TABLE "bike_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bike_model_id" uuid NOT NULL,
	"bike_size_id" uuid NOT NULL,
	"bike_version_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bike_units" ADD CONSTRAINT "bike_units_bike_model_id_bike_models_id_fk" FOREIGN KEY ("bike_model_id") REFERENCES "public"."bike_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bike_units" ADD CONSTRAINT "bike_units_bike_size_id_bike_sizes_id_fk" FOREIGN KEY ("bike_size_id") REFERENCES "public"."bike_sizes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bike_units" ADD CONSTRAINT "bike_units_bike_version_id_bike_versions_id_fk" FOREIGN KEY ("bike_version_id") REFERENCES "public"."bike_versions"("id") ON DELETE no action ON UPDATE no action;