ALTER TABLE "customers" ADD COLUMN "language" text DEFAULT 'it' NOT NULL;
--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_language_check" CHECK ("language" IN ('it', 'en', 'de'));
