ALTER TABLE "media" ADD COLUMN "sha256" text;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "gpx_sha256" text;--> statement-breakpoint
CREATE INDEX "media_sha256_idx" ON "media" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "routes_gpx_sha256_idx" ON "routes" USING btree ("gpx_sha256");