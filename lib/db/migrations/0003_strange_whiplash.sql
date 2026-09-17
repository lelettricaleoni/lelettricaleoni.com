CREATE TABLE "bike_model_sizes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bike_model_id" uuid NOT NULL,
	"bike_size_id" uuid NOT NULL,
	CONSTRAINT "bike_model_sizes_model_size_unique" UNIQUE("bike_model_id","bike_size_id")
);
--> statement-breakpoint
CREATE TABLE "bike_model_translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bike_model_id" uuid NOT NULL,
	"locale" "locale" NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"is_auto_translated" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bike_model_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bike_model_id" uuid NOT NULL,
	"bike_version_id" uuid NOT NULL,
	CONSTRAINT "bike_model_versions_model_version_unique" UNIQUE("bike_model_id","bike_version_id")
);
--> statement-breakpoint
CREATE TABLE "bike_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"price_surcharge" numeric,
	"battery_range" text,
	"motor" text,
	"gear_count" text,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bike_model_sizes" ADD CONSTRAINT "bike_model_sizes_bike_model_id_bike_models_id_fk" FOREIGN KEY ("bike_model_id") REFERENCES "public"."bike_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bike_model_sizes" ADD CONSTRAINT "bike_model_sizes_bike_size_id_bike_sizes_id_fk" FOREIGN KEY ("bike_size_id") REFERENCES "public"."bike_sizes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bike_model_translations" ADD CONSTRAINT "bike_model_translations_bike_model_id_bike_models_id_fk" FOREIGN KEY ("bike_model_id") REFERENCES "public"."bike_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bike_model_versions" ADD CONSTRAINT "bike_model_versions_bike_model_id_bike_models_id_fk" FOREIGN KEY ("bike_model_id") REFERENCES "public"."bike_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bike_model_versions" ADD CONSTRAINT "bike_model_versions_bike_version_id_bike_versions_id_fk" FOREIGN KEY ("bike_version_id") REFERENCES "public"."bike_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bike_models" ADD CONSTRAINT "bike_models_category_id_bike_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."bike_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bike_model_translations_model_locale_idx" ON "bike_model_translations" USING btree ("bike_model_id","locale");