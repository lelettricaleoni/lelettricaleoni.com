ALTER TABLE "bike_models" ADD COLUMN "color" text;--> statement-breakpoint
-- A colour is `#rrggbb`, lowercase, or none: refused here, not only in the form.
ALTER TABLE "bike_models" ADD CONSTRAINT "bike_models_color_check" CHECK ("color" IS NULL OR "color" ~ '^#[0-9a-f]{6}$');--> statement-breakpoint
-- The models that exist get their first colours, in the order the site shows them (the categories, then the models of each): the list
-- is MODEL_COLORS of lib/bike-colors.ts, in the same order, and it starts again when it runs out.
UPDATE "bike_models" AS m SET "color" = (ARRAY['#039be5', '#f4511e', '#33b679', '#8e24aa', '#f6bf26', '#e91e63', '#3f51b5', '#0b8043', '#d50000', '#009688', '#795548', '#7cb342'])[((o.rn - 1) % 12) + 1]
FROM (
  SELECT m2."id", row_number() OVER (ORDER BY c."display_order", c."name", c."id", m2."display_order", m2."created_at") AS rn
  FROM "bike_models" m2 JOIN "bike_categories" c ON c."id" = m2."category_id"
) AS o
WHERE m."id" = o."id";
