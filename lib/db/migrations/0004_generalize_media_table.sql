ALTER TABLE "route_photos" RENAME TO "media";
ALTER TABLE "media" ADD COLUMN "bike_model_id" uuid REFERENCES "bike_models"("id") ON DELETE CASCADE;
ALTER TABLE "media" ALTER COLUMN "route_id" DROP NOT NULL;
ALTER TABLE "media" ADD CONSTRAINT "media_exactly_one_owner" CHECK (num_nonnulls("route_id", "bike_model_id") = 1);
ALTER INDEX "route_photos_route_idx" RENAME TO "media_route_idx";
CREATE INDEX "media_bike_model_idx" ON "media" ("bike_model_id");
