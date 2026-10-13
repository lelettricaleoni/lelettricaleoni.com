CREATE TABLE "shop_closures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"reason" text,
	CONSTRAINT "shop_closures_order" CHECK ("ends_on" > "starts_on")
);
--> statement-breakpoint
CREATE TABLE "shop_opening_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"weekday" smallint NOT NULL,
	"opens_at" time NOT NULL,
	"closes_at" time NOT NULL,
	CONSTRAINT "shop_opening_hours_weekday" CHECK ("weekday" BETWEEN 1 AND 7),
	CONSTRAINT "shop_opening_hours_order" CHECK ("opens_at" < "closes_at")
);
--> statement-breakpoint
-- Explicit, not left to the ensure_rls event trigger: development and Preview do not have it.
-- No policies on purpose: the app connects as `postgres`, which bypasses RLS.
ALTER TABLE "shop_closures" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "shop_opening_hours" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Today's hours (docs/contact-details.md): every day 09:00-13:00 and 14:00-19:00. From here the shop changes them in the panel.
INSERT INTO "shop_opening_hours" ("weekday", "opens_at", "closes_at")
SELECT day, hours.opens_at, hours.closes_at
FROM generate_series(1, 7) AS day,
     (VALUES ('09:00'::time, '13:00'::time), ('14:00'::time, '19:00'::time)) AS hours(opens_at, closes_at);
