import {
  pgTable, text, integer, numeric, boolean,
  timestamp, uuid, pgEnum, index, unique
} from 'drizzle-orm/pg-core'

export const difficultyEnum = pgEnum('difficulty', ['easy', 'medium', 'hard', 'expert'])
export const localeEnum = pgEnum('locale', ['it', 'en', 'de'])
export const mediaTypeEnum = pgEnum('media_type', ['photo', 'video'])
export const bikePricingModeEnum = pgEnum('bike_pricing_mode', ['table', 'linear'])

export const routes = pgTable('routes', {
  id:          uuid('id').primaryKey().defaultRandom(),
  slug:        text('slug').notNull().unique(),
  difficulty:  difficultyEnum('difficulty').notNull(),
  distanceKm:  numeric('distance_km', { precision: 6, scale: 2 }),
  elevationM:  integer('elevation_m'),
  durationMin: integer('duration_min'),
  bikeTypes:   text('bike_types').array().notNull().default([]),
  stravaUrl:   text('strava_url'),
  komootUrl:   text('komoot_url'),
  gpxKey:      text('gpx_key'),
  videoKey:    text('video_key'),
  isPublished: boolean('is_published').notNull().default(false),
  // Reachable at its own URL, just never offered up: absent from the routes
  // list and the sitemap, same as an unlisted video. Independent of
  // isPublished — an unpublished route is unlisted by consequence (it 404s
  // everywhere), this is for a published one you only want found by link.
  unlisted:    boolean('unlisted').notNull().default(false),
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

export type Route = typeof routes.$inferSelect
export type RouteTranslation = typeof routeTranslations.$inferSelect
export type NewRoute = typeof routes.$inferInsert
export type NewRouteTranslation = typeof routeTranslations.$inferInsert

export const bikeSizes = pgTable('bike_sizes', {
  id:           uuid('id').primaryKey().defaultRandom(),
  name:         text('name').notNull(),
  displayOrder: integer('display_order').notNull().default(0),
})

export const bikeVersions = pgTable('bike_versions', {
  id:           uuid('id').primaryKey().defaultRandom(),
  name:         text('name').notNull(),
  displayOrder: integer('display_order').notNull().default(0),
})

// Prices: numeric() maps to Postgres NUMERIC, which postgres.js returns as a
// string, not a number — cast with `::int`/`::numeric` in raw SQL, or
// Number(...) after a Drizzle read, exactly like the rest of this codebase
// already does (see lib/dev-stats.ts).
export const bikeCategories = pgTable('bike_categories', {
  id:               uuid('id').primaryKey().defaultRandom(),
  name:             text('name').notNull(),
  displayOrder:     integer('display_order').notNull().default(0),
  maxRentalDays:    integer('max_rental_days').notNull(),
  pricingMode:      bikePricingModeEnum('pricing_mode').notNull().default('table'),
  day1Price:        numeric('day1_price').notNull(),
  day2Price:        numeric('day2_price'),
  day3Price:        numeric('day3_price'),
  day4Price:        numeric('day4_price'),
  day5Price:        numeric('day5_price'),
  day6Price:        numeric('day6_price'),
  day7Price:        numeric('day7_price'),
  perDayAfterPrice: numeric('per_day_after_price'),
  afternoonPrice:   numeric('afternoon_price'),
})

export type BikeSize = typeof bikeSizes.$inferSelect
export type BikeVersion = typeof bikeVersions.$inferSelect
export type BikeCategory = typeof bikeCategories.$inferSelect
export type NewBikeSize = typeof bikeSizes.$inferInsert
export type NewBikeVersion = typeof bikeVersions.$inferInsert
export type NewBikeCategory = typeof bikeCategories.$inferInsert

export const bikeModels = pgTable('bike_models', {
  id:             uuid('id').primaryKey().defaultRandom(),
  categoryId:     uuid('category_id').notNull().references(() => bikeCategories.id),
  priceSurcharge: numeric('price_surcharge'),
  batteryRange:   text('battery_range'),
  motor:          text('motor'),
  gearCount:      text('gear_count'),
  isPublished:    boolean('is_published').notNull().default(false),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
  updatedAt:      timestamp('updated_at').notNull().defaultNow(),
})

export const bikeModelTranslations = pgTable('bike_model_translations', {
  id:               uuid('id').primaryKey().defaultRandom(),
  bikeModelId:      uuid('bike_model_id').notNull().references(() => bikeModels.id, { onDelete: 'cascade' }),
  locale:           localeEnum('locale').notNull(),
  name:             text('name').notNull(),
  description:      text('description').notNull(),
  isAutoTranslated: boolean('is_auto_translated').notNull().default(false),
}, (t) => [index('bike_model_translations_model_locale_idx').on(t.bikeModelId, t.locale)])

// No onDelete on bikeSizeId/bikeVersionId: deleting a global size or version
// that a model still allows must fail loudly, not silently orphan rows.
export const bikeModelSizes = pgTable('bike_model_sizes', {
  id:           uuid('id').primaryKey().defaultRandom(),
  bikeModelId:  uuid('bike_model_id').notNull().references(() => bikeModels.id, { onDelete: 'cascade' }),
  bikeSizeId:   uuid('bike_size_id').notNull().references(() => bikeSizes.id),
}, (t) => [unique('bike_model_sizes_model_size_unique').on(t.bikeModelId, t.bikeSizeId)])

export const bikeModelVersions = pgTable('bike_model_versions', {
  id:            uuid('id').primaryKey().defaultRandom(),
  bikeModelId:   uuid('bike_model_id').notNull().references(() => bikeModels.id, { onDelete: 'cascade' }),
  bikeVersionId: uuid('bike_version_id').notNull().references(() => bikeVersions.id),
}, (t) => [unique('bike_model_versions_model_version_unique').on(t.bikeModelId, t.bikeVersionId)])

export type BikeModel = typeof bikeModels.$inferSelect
export type BikeModelTranslation = typeof bikeModelTranslations.$inferSelect
export type NewBikeModel = typeof bikeModels.$inferInsert
export type NewBikeModelTranslation = typeof bikeModelTranslations.$inferInsert

// No onDelete cascade on any of the three references: a model, size, or
// version still used by an existing physical bike must not be deletable
// out from under it.
export const bikeUnits = pgTable('bike_units', {
  id:            uuid('id').primaryKey().defaultRandom(),
  bikeModelId:   uuid('bike_model_id').notNull().references(() => bikeModels.id),
  bikeSizeId:    uuid('bike_size_id').notNull().references(() => bikeSizes.id),
  bikeVersionId: uuid('bike_version_id').notNull().references(() => bikeVersions.id),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
})

export type BikeUnit = typeof bikeUnits.$inferSelect
export type NewBikeUnit = typeof bikeUnits.$inferInsert

// Generalized from route_photos on 2026-09-17 to also hold bike model
// media. Exactly one of routeId/bikeModelId is set, enforced by a CHECK
// constraint added in the migration for this table (Drizzle's pg-core has
// no first-class `check()` table builder in this version, so the
// constraint is added directly in the generated SQL).
export const media = pgTable('media', {
  id:           uuid('id').primaryKey().defaultRandom(),
  routeId:      uuid('route_id').references(() => routes.id, { onDelete: 'cascade' }),
  bikeModelId:  uuid('bike_model_id').references(() => bikeModels.id, { onDelete: 'cascade' }),
  storageKey:   text('storage_key').notNull(),
  mediaType:    mediaTypeEnum('media_type').notNull().default('photo'),
  displayOrder: integer('display_order').notNull().default(0),
  altText:      text('alt_text'),
  createdAt:    timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('media_route_idx').on(t.routeId),
  index('media_bike_model_idx').on(t.bikeModelId),
])

export type Media = typeof media.$inferSelect
export type NewMedia = typeof media.$inferInsert
