import { sql } from 'drizzle-orm'
import {
  pgTable, text, integer, numeric, boolean,
  timestamp, uuid, pgEnum, index, unique, uniqueIndex, date, jsonb
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
  gpxSha256:   text('gpx_sha256'),
  videoKey:    text('video_key'),
  isPublished: boolean('is_published').notNull().default(false),
  // Reachable at its own URL, just never offered up: absent from the routes
  // list and the sitemap, same as an unlisted video. Independent of
  // isPublished — an unpublished route is unlisted by consequence (it 404s
  // everywhere), this is for a published one you only want found by link.
  unlisted:    boolean('unlisted').notNull().default(false),
  // Admin-assigned order, both in the admin list and on the public /routes
  // page. Nothing derives it automatically — it only ever changes through
  // reorderRoutesAction, one drag in the admin list at a time.
  displayOrder: integer('display_order').notNull().default(0),
  createdAt:   timestamp('created_at').notNull().defaultNow(),
  updatedAt:   timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('routes_slug_idx').on(t.slug),
  index('routes_published_idx').on(t.isPublished),
  index('routes_gpx_sha256_idx').on(t.gpxSha256),
])

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

// Il terreno/stile per cui un percorso è adatto — non la categoria di
// prezzo di bikeCategories sotto, che è un concetto diverso. Una categoria
// di prezzo può collegarsi a una di queste (routeCategoryId), più categorie
// di prezzo alla stessa, o a nessuna.
export const routeBikeCategories = pgTable('route_bike_categories', {
  id:           uuid('id').primaryKey().defaultRandom(),
  name:         text('name').notNull().unique(),
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
  routeCategoryId:  uuid('route_category_id').references(() => routeBikeCategories.id),
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
export type RouteBikeCategory = typeof routeBikeCategories.$inferSelect
export type NewRouteBikeCategory = typeof routeBikeCategories.$inferInsert
export type BikeCategory = typeof bikeCategories.$inferSelect
export type NewBikeSize = typeof bikeSizes.$inferInsert
export type NewBikeVersion = typeof bikeVersions.$inferInsert
export type NewBikeCategory = typeof bikeCategories.$inferInsert

export const bikeModels = pgTable('bike_models', {
  id:             uuid('id').primaryKey().defaultRandom(),
  categoryId:     uuid('category_id').notNull().references(() => bikeCategories.id),
  // Deprecated: an absolute amount in euros that no price ever read, so it never did anything
  // (found 2026-10-07). Replaced by priceAdjustmentPercent. Kept only so the next migration
  // does not generate a DROP COLUMN by itself: drop it in a migration of its own, on purpose.
  priceSurcharge: numeric('price_surcharge'),
  // The model's own percentage over its category's prices: +10 is a surcharge on every price of the
  // category, -10 a discount. 0 is "the category's prices as they are". See lib/bike-pricing.ts.
  priceAdjustmentPercent: numeric('price_adjustment_percent', { precision: 5, scale: 2 }).notNull().default('0'),
  batteryRange:   text('battery_range'),
  motor:          text('motor'),
  gearCount:      text('gear_count'),
  isPublished:    boolean('is_published').notNull().default(false),
  // Ordine assegnato dall'admin, sia nella lista di /manage/bikes sia nella
  // pagina pubblica /bikes. Cambia solo tramite reorderBikeModelsAction, un
  // drag alla volta nella lista admin — stesso meccanismo di
  // routes.displayOrder.
  displayOrder:   integer('display_order').notNull().default(0),
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
  // The first day this bike is NOT offered any more (sold, retired); null = in service. Rentals
  // and the public "in garage" lists stop at that day. Never deleted instead: its reservations
  // are the history, and bike_reservations points at it.
  retiredOn:     date('retired_on', { mode: 'string' }),
})

export type BikeUnit = typeof bikeUnits.$inferSelect
export type NewBikeUnit = typeof bikeUnits.$inferInsert

export const reservationKindEnum = pgEnum('reservation_kind', ['counter_rental', 'maintenance', 'online_rental'])
export const reservationStatusEnum = pgEnum('reservation_status', ['confirmed', 'held', 'expired', 'cancelled'])

// The people who rent, from the counter or (later) online. One row per person: the same phone or
// the same email is the same customer, so a counter customer who later registers online with that
// email lands on the same row and keeps the history. `user_id` is the auth account, once there is one.
// First and last name are required; the contacts are optional but unique when present.
export const customers = pgTable('customers', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    uuid('user_id').unique(),
  firstName: text('first_name').notNull(),
  lastName:  text('last_name').notNull(),
  email:     text('email'),
  phone:     text('phone'),
  notes:     text('notes'),
  // The language this person reads: of the site once they are signed in, and of what the shop writes to them.
  // It starts as the language they were visiting in when the account was made (lib/auth/language.ts).
  language:  text('language').notNull().default('it'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('customers_email_unique').on(t.email),
  uniqueIndex('customers_phone_unique').on(t.phone),
])

export type Customer = typeof customers.$inferSelect

export const bookingStatusEnum = pgEnum('booking_status', ['pending', 'confirmed', 'cancelled', 'expired', 'failed_refunded'])

// One payment: the bikes of one cart, with the same days. `pending` while the bikes are held and the
// payment is on its way, `confirmed` once paid, `expired` when the hold ran out (or was given up),
// `cancelled` when every bike has been cancelled, `failed_refunded` when a payment arrived for bikes
// that were no longer ours and was given back in full (docs/superpowers/specs/2026-10-07-booking-slice3-*).
export const bookings = pgTable('bookings', {
  id:                    uuid('id').primaryKey().defaultRandom(),
  customerId:            uuid('customer_id').notNull().references(() => customers.id),
  // The idempotency key of the whole booking: asking twice with it finds the same booking.
  requestKey:            uuid('request_key').notNull().unique(),
  status:                bookingStatusEnum('status').notNull().default('pending'),
  startsOn:              date('starts_on', { mode: 'string' }).notNull(),
  endsOn:                date('ends_on', { mode: 'string' }).notNull(),
  totalCents:            integer('total_cents').notNull(),
  // The language of the page the person booked from.
  language:              text('language').notNull().default('it'),
  stripeSessionId:       text('stripe_session_id').unique(),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  holdExpiresAt:         timestamp('hold_expires_at', { withTimezone: true }).notNull(),
  // How many bikes the booking is made of: a booking holding fewer is still being put together (or was left half done)
  // and is neither shown as ready nor confirmed.
  lineCount:             integer('line_count').notNull().default(1),
  createdAt:             timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  confirmedAt:           timestamp('confirmed_at', { withTimezone: true }),
}, (t) => [
  index('bookings_customer_idx').on(t.customerId),
  // At most one payment on its way per customer: the application checks first, this is what holds when two tabs race.
  uniqueIndex('bookings_one_pending_per_customer').on(t.customerId).where(sql`${t.status} = 'pending'`),
  index('bookings_status_expires_idx').on(t.status, t.holdExpiresAt),
])

export type Booking = typeof bookings.$inferSelect
export type NewBooking = typeof bookings.$inferInsert

// One row per bike and period: a rental at the counter, or a maintenance block. The rule that
// two `confirmed` rows on the same bike cannot overlap lives in the database (an EXCLUDE
// constraint on `during`), added by hand in migration 0010 because Drizzle generates neither
// exclusion constraints nor generated columns. `during` is that generated daterange,
// [starts_on, ends_on): it is deliberately not declared here, the app only ever reads the two dates.
//
// `ends_on` is exclusive: a rental from the 10th to the 12th included is ends_on = the 13th.
// `request_key` is the idempotency key the form generates when it opens: a repeated submit
// finds the row instead of creating a second one.
export const bikeReservations = pgTable('bike_reservations', {
  id:          uuid('id').primaryKey().defaultRandom(),
  bikeUnitId:  uuid('bike_unit_id').notNull().references(() => bikeUnits.id),
  kind:        reservationKindEnum('kind').notNull(),
  status:      reservationStatusEnum('status').notNull().default('confirmed'),
  startsOn:    date('starts_on', { mode: 'string' }).notNull(),
  endsOn:      date('ends_on', { mode: 'string' }).notNull(),
  // `label` is only the reason of a maintenance. A rental points at its customer.
  label:       text('label'),
  customerId:  uuid('customer_id').references(() => customers.id),
  // The booking an online rental belongs to (null for the counter and for maintenance).
  bookingId:   uuid('booking_id').references(() => bookings.id),
  // What the rental was paid, in whole cents (lib/money.ts); null for a maintenance.
  amountCents: integer('amount_cents'),
  requestKey:  uuid('request_key').notNull().unique(),
  createdAt:   timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('bike_reservations_unit_starts_idx').on(t.bikeUnitId, t.startsOn),
  index('bike_reservations_customer_idx').on(t.customerId),
  index('bike_reservations_booking_idx').on(t.bookingId),
])

export type BikeReservation = typeof bikeReservations.$inferSelect
export type NewBikeReservation = typeof bikeReservations.$inferInsert

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
  // Nullable: null only means "not computed yet", it never blocks anything.
  // Arrives later for a video, from the worker (see lib/actions/media-hash.ts).
  sha256:       text('sha256'),
  createdAt:    timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('media_route_idx').on(t.routeId),
  index('media_bike_model_idx').on(t.bikeModelId),
  index('media_sha256_idx').on(t.sha256),
])

export type Media = typeof media.$inferSelect
export type NewMedia = typeof media.$inferInsert

// Integrations with outside services (Google Calendar first), switched on and configured from the panel. One
// row per integration, keyed by its id in lib/integrations/registry.ts. The secret (a service account key) is
// stored ENCRYPTED (lib/integrations/crypto.ts) and is never read back by the panel: `config` holds only what
// is safe to show.
export const integrations = pgTable('integrations', {
  id:              text('id').primaryKey(),
  enabled:         boolean('enabled').notNull().default(false),
  config:          jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  secretEncrypted: text('secret_encrypted'),
  lastCheckedAt:   timestamp('last_checked_at'),
  lastSyncAt:      timestamp('last_sync_at'),
  lastError:       text('last_error'),
  updatedAt:       timestamp('updated_at').notNull().defaultNow(),
  updatedBy:       uuid('updated_by'),
})

export type Integration = typeof integrations.$inferSelect
