CREATE TABLE "integrations" (
	"id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secret_encrypted" text,
	"last_checked_at" timestamp,
	"last_sync_at" timestamp,
	"last_error" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
-- Explicit RLS, as in 0010 and 0013 (the ensure_rls event trigger exists in every environment now, but the
-- migration must not depend on it). No policies on purpose: the app connects as `postgres`, which bypasses
-- RLS, and a row can hold an encrypted secret.
ALTER TABLE "integrations" ENABLE ROW LEVEL SECURITY;
