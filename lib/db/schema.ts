import {
  pgTable, text, integer, numeric, boolean,
  timestamp, uuid, pgEnum, index
} from 'drizzle-orm/pg-core'

export const difficultyEnum = pgEnum('difficulty', ['easy', 'medium', 'hard', 'expert'])
export const surfaceEnum = pgEnum('surface', ['asphalt', 'dirt', 'mixed'])
export const localeEnum = pgEnum('locale', ['it', 'en', 'de'])
export const mediaTypeEnum = pgEnum('media_type', ['photo', 'video'])

export const routes = pgTable('routes', {
  id:          uuid('id').primaryKey().defaultRandom(),
  slug:        text('slug').notNull().unique(),
  difficulty:  difficultyEnum('difficulty').notNull(),
  distanceKm:  numeric('distance_km', { precision: 6, scale: 2 }),
  elevationM:  integer('elevation_m'),
  durationMin: integer('duration_min'),
  surface:     surfaceEnum('surface').notNull().default('mixed'),
  bikeTypes:   text('bike_types').array().notNull().default([]),
  stravaUrl:   text('strava_url'),
  komootUrl:   text('komoot_url'),
  gpxKey:      text('gpx_key'),
  videoKey:    text('video_key'),
  isPublished: boolean('is_published').notNull().default(false),
  createdAt:   timestamp('created_at').notNull().defaultNow(),
  updatedAt:   timestamp('updated_at').notNull().defaultNow(),
}, (t) => [index('routes_slug_idx').on(t.slug), index('routes_published_idx').on(t.isPublished)])

export const routeTranslations = pgTable('route_translations', {
  id:                uuid('id').primaryKey().defaultRandom(),
  routeId:           uuid('route_id').notNull().references(() => routes.id, { onDelete: 'cascade' }),
  locale:            localeEnum('locale').notNull(),
  name:              text('name').notNull(),
  description:       text('description').notNull(),
  isAutoTranslated:  boolean('is_auto_translated').notNull().default(false),
}, (t) => [index('route_translations_route_locale_idx').on(t.routeId, t.locale)])

export const routePhotos = pgTable('route_photos', {
  id:           uuid('id').primaryKey().defaultRandom(),
  routeId:      uuid('route_id').notNull().references(() => routes.id, { onDelete: 'cascade' }),
  storageKey:   text('storage_key').notNull(),
  mediaType:    mediaTypeEnum('media_type').notNull().default('photo'),
  displayOrder: integer('display_order').notNull().default(0),
  altText:      text('alt_text'),
  createdAt:    timestamp('created_at').notNull().defaultNow(),
}, (t) => [index('route_photos_route_idx').on(t.routeId)])

export type Route = typeof routes.$inferSelect
export type RouteTranslation = typeof routeTranslations.$inferSelect
export type RoutePhoto = typeof routePhotos.$inferSelect
export type NewRoute = typeof routes.$inferInsert
export type NewRouteTranslation = typeof routeTranslations.$inferInsert
export type NewRoutePhoto = typeof routePhotos.$inferInsert
