CREATE TYPE media_type AS ENUM ('photo', 'video');
ALTER TABLE route_photos ADD COLUMN media_type media_type NOT NULL DEFAULT 'photo';
