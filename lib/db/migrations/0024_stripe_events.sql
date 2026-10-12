CREATE TABLE "stripe_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);

--> statement-breakpoint
-- Explicit, not left to the ensure_rls event trigger: development and Preview do not have it.
-- No policies on purpose: the app connects as `postgres`, which bypasses RLS.
ALTER TABLE "stripe_events" ENABLE ROW LEVEL SECURITY;
