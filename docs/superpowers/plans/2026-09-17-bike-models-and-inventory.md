# Bike Models Catalog and Shop Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Kevin asked explicitly for one task at a time, with a checkpoint between each — do not batch tasks.**

**Goal:** Build the admin-only foundation for bike rental — a catalog of bike models and a
physical inventory ("Il mio negozio") — as the first concrete step toward a future
booking/Stripe system.

**Architecture:** Three new global option tables (sizes, versions, priced categories) that
a bike model selects a subset from; bike models own translated content and media; physical
"bike units" are individual rows, each referencing one model plus one size/version the
model allows. The existing `route_photos` table is generalized into a shared `media` table
with exclusive-arc foreign keys (one nullable FK per owner type, a CHECK ensuring exactly
one is set) so Postgres itself guarantees referential integrity — chosen over a polymorphic
`subject_type`/`subject_id` design specifically to keep that guarantee.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM (`drizzle-orm/postgres-js`), Supabase
Postgres, Server Actions, shadcn/ui, Azure Translator (existing `translateFromItalian`),
Cloudflare R2 (existing presigned-upload pipeline), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-17-bike-models-and-inventory-design.md`

## Global Constraints

- Server Action, never a route handler, for anything the frontend itself calls (`CLAUDE.md`).
- Every admin mutation starts with the same `getAdminUser()` gate already used everywhere
  else in `/manage` — no separate permission for this feature.
- Bike model name/description: admin writes Italian only; `translateFromItalian` (Azure)
  generates EN/DE, exactly like routes.
- A bike unit's shop code is `id.slice(0, 8)` — the same `shortRouteId`-style convention
  routes use, reused via the existing `lib/utils.ts` helper, not reinvented.
- No status/condition field on a bike unit — decided explicitly out of scope for this phase.
- Media (photos/videos) for bike models reuses the routes upload pipeline (presigned URL to
  R2, HLS worker for video) — never a second pipeline.
- Every schema change needs `npx drizzle-kit generate` then `npx drizzle-kit migrate`
  applied to **both** the dev and production Supabase projects (see the `db-migrations`
  skill) — never only one.
- No code, identifiers, or comments in Italian — only `messages/{it,en,de}.json` content is
  (existing project rule).

---

## File Structure

New files this plan creates:

```
lib/db/schema.ts                        # extended, not replaced
lib/db/migrations/                      # new generated SQL files
lib/bike-pricing.ts                     # pure price-for-day calculator
lib/bike-pricing.test.ts
lib/actions/bike-options.ts             # sizes/versions/categories CRUD
lib/actions/bike-models.ts              # model catalog CRUD
lib/actions/bike-units.ts               # shop inventory CRUD

components/admin/bike-size-list.tsx
components/admin/bike-version-list.tsx
components/admin/bike-category-list.tsx
components/admin/bike-category-form.tsx
components/admin/bike-model-list-item.tsx
components/admin/bike-model-form.tsx
components/admin/bike-unit-list.tsx
components/admin/bike-unit-form.tsx

app/manage/bike-options/page.tsx
app/manage/bikes/page.tsx
app/manage/bikes/new/page.tsx
app/manage/bikes/[id]/page.tsx
app/manage/bikes/shop/page.tsx
```

Existing files this plan modifies:

```
lib/db/schema.ts                        # route_photos → media, new tables
lib/actions/routes.ts                   # media table rename, MediaUpload prop wiring
lib/routes-data.ts                      # media table rename
lib/dev-stats.ts                        # media table rename
lib/flags.ts                            # media table rename (comment/reference only — verify)
lib/flags.test.ts                       # media table rename
app/[lang]/routes/[id]/page.tsx         # media table rename
components/route-card-media-async.tsx   # media table rename
components/admin/media-upload.tsx       # generalized to take injected upload actions
components/admin/route-form.tsx         # updated MediaUpload call site
components/admin/admin-sidebar.tsx      # three new nav entries
```

Each new admin surface (options, models, shop) gets its own list/form component pair,
mirroring the existing routes admin split (`route-list-item.tsx` / `route-form.tsx`) —
same pattern, not a shared generic component, because the three forms have genuinely
different fields and a shared abstraction would need to flex more than it would save.

---

### Task 1: Schema — global option lists

**Files:**
- Modify: `lib/db/schema.ts`

**Interfaces:**
- Produces: `bikeSizes`, `bikeVersions`, `bikeCategories` tables; `bikePricingModeEnum`;
  types `BikeSize`, `BikeVersion`, `BikeCategory`, `NewBikeSize`, `NewBikeVersion`,
  `NewBikeCategory`.

- [ ] **Step 1: Add the enum and three tables to `lib/db/schema.ts`**

Append after the existing `mediaTypeEnum` declaration (keep the existing enums untouched):

```ts
export const bikePricingModeEnum = pgEnum('bike_pricing_mode', ['table', 'linear'])
```

Append near the end of the file, after the existing `routePhotos` table (do not touch
`routePhotos` in this task — that happens in Task 4):

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Generate and apply the migration**

Run: `npx drizzle-kit generate`
Expected: a new file under `lib/db/migrations/`, e.g. `0002_<name>.sql`, creating the enum
and three tables — no other tables touched.

Read the generated SQL before applying it — confirm it only adds the enum and the three
`CREATE TABLE` statements, nothing else.

Run: `npx drizzle-kit migrate` (with `DATABASE_DIRECT_URL` pointed at the **dev** Supabase
project — confirm which project it targets before running, per the `db-migrations` skill).
Expected: migration applied, no errors.

Repeat `npx drizzle-kit migrate` against the **production** `DATABASE_DIRECT_URL`. Both
databases must end up with the same migration applied — do not skip production and leave it
for later.

- [ ] **Step 4: Commit**

```bash
git add lib/db/schema.ts lib/db/migrations/
git commit -m "Add bike_sizes, bike_versions, bike_categories tables"
```

---

### Task 2: Schema — bike model catalog

**Files:**
- Modify: `lib/db/schema.ts`

**Interfaces:**
- Consumes: `bikeCategories`, `bikeSizes`, `bikeVersions` (Task 1); `localeEnum` (existing).
- Produces: `bikeModels`, `bikeModelTranslations`, `bikeModelSizes`, `bikeModelVersions`
  tables; types `BikeModel`, `BikeModelTranslation`, `NewBikeModel`,
  `NewBikeModelTranslation`.

- [ ] **Step 1: Add the `unique` import**

`lib/db/schema.ts`'s import line currently reads:

```ts
import {
  pgTable, text, integer, numeric, boolean,
  timestamp, uuid, pgEnum, index
} from 'drizzle-orm/pg-core'
```

Change it to add `unique`:

```ts
import {
  pgTable, text, integer, numeric, boolean,
  timestamp, uuid, pgEnum, index, unique
} from 'drizzle-orm/pg-core'
```

- [ ] **Step 2: Add the four tables**

Append after the tables from Task 1:

```ts
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
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors. `bikeCategories`/`bikeSizes`/`bikeVersions` must already exist from
Task 1 — if this task is picked up standalone, Task 1 must be merged first.

- [ ] **Step 4: Generate and apply the migration**

Same process as Task 1, Step 3: `npx drizzle-kit generate`, inspect the SQL (four new
tables, two unique constraints, no changes to unrelated tables), then
`npx drizzle-kit migrate` against dev, then against production.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts lib/db/migrations/
git commit -m "Add bike_models, translations, and size/version junction tables"
```

---

### Task 3: Schema — shop inventory (`bike_units`)

**Files:**
- Modify: `lib/db/schema.ts`

**Interfaces:**
- Consumes: `bikeModels`, `bikeSizes`, `bikeVersions` (Tasks 1-2).
- Produces: `bikeUnits` table; types `BikeUnit`, `NewBikeUnit`.

- [ ] **Step 1: Add the table**

Append after the tables from Task 2:

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Generate and apply the migration**

Same process as before: generate, inspect (one new table, three foreign keys, no cascade),
apply to dev then production.

- [ ] **Step 4: Commit**

```bash
git add lib/db/schema.ts lib/db/migrations/
git commit -m "Add bike_units table for shop inventory"
```

---

### Task 4: Generalize the media table

This is the task that touches the existing, working routes system — read it fully before
starting, and do not skip the verification step.

**Files:**
- Modify: `lib/db/schema.ts`
- Modify: `lib/actions/routes.ts`
- Modify: `lib/routes-data.ts`
- Modify: `lib/dev-stats.ts`
- Modify: `app/[lang]/routes/[id]/page.tsx`
- Modify: `components/route-card-media-async.tsx`
- Modify: `lib/flags.test.ts` (only if it references `routePhotos` directly — check first)
- Verify (read-only check): `lib/flags.ts` (STATE.md/spec listed it as a hit; confirm
  whether it actually imports `routePhotos` or just mentions routes/photos in a comment —
  if the latter, no code change needed there)

**Interfaces:**
- Produces: `media` table (renamed from `routePhotos`), with `routeId` and `bikeModelId`
  both nullable and a CHECK constraint. Drizzle export name changes from `routePhotos` to
  `media`; the exported type changes from `RoutePhoto` to `Media`.

- [ ] **Step 1: Confirm the real blast radius before touching anything**

Run: `grep -rln "routePhotos" --include="*.ts" --include="*.tsx" .` (excluding
`node_modules`) and compare the result against the file list above. If the list differs
from what's here, update this task's file list to match reality before proceeding — this
plan was written against the codebase as of 2026-09-16 and file contents may have moved.

- [ ] **Step 2: Rename and extend the table in `lib/db/schema.ts`**

Find:

```ts
export const routePhotos = pgTable('route_photos', {
  id:           uuid('id').primaryKey().defaultRandom(),
  routeId:      uuid('route_id').notNull().references(() => routes.id, { onDelete: 'cascade' }),
  storageKey:   text('storage_key').notNull(),
  mediaType:    mediaTypeEnum('media_type').notNull().default('photo'),
  displayOrder: integer('display_order').notNull().default(0),
  altText:      text('alt_text'),
  createdAt:    timestamp('created_at').notNull().defaultNow(),
}, (t) => [index('route_photos_route_idx').on(t.routeId)])
```

Replace with:

```ts
// Generalized from route_photos on 2026-09-17 to also hold bike model
// media. Exactly one of routeId/bikeModelId is set, enforced by a CHECK
// constraint added in the migration for this table (Drizzle's pg-core has
// no first-class `check()` table builder in this version, so the
// constraint is added directly in the generated SQL — see Step 4).
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
```

Find and replace the type exports:

```ts
export type RoutePhoto = typeof routePhotos.$inferSelect
```

becomes:

```ts
export type Media = typeof media.$inferSelect
export type NewMedia = typeof media.$inferInsert
```

- [ ] **Step 3: Update every consumer**

In each of these files, replace the import and every usage of `routePhotos` with `media`,
and `RoutePhoto` with `Media` where the type is imported. The query shape (columns
selected, `where` clauses filtering on `routeId`) does not change — only the identifier.

`lib/actions/routes.ts` — imports `routePhotos` from `@/lib/db`; used in
`createRouteAction`, `updateRouteAction`, `deleteRouteAction`, `getRouteWithDetails`,
`savePhotosAction`. Every `db.insert(routePhotos).values({ routeId: ..., ... })` becomes
`db.insert(media).values({ routeId: ..., ... })` — the `routeId` field itself doesn't
change name, `bikeModelId` is simply left unset (defaults to `null`, which combined with
`routeId` being set satisfies the CHECK constraint).

`lib/routes-data.ts`, `lib/dev-stats.ts`, `app/[lang]/routes/[id]/page.tsx`,
`components/route-card-media-async.tsx` — same mechanical rename, no logic changes.

`lib/flags.ts` — check first whether it actually imports/queries `routePhotos`, or only
mentions "photos" in prose. Only change code if there's a real reference.

`lib/flags.test.ts` — if it references `routePhotos` in test fixtures, rename there too.

- [ ] **Step 4: Write the migration by hand, not with `drizzle-kit generate` alone**

`drizzle-kit generate` will produce a `DROP TABLE route_photos` + `CREATE TABLE media`
pair by default when it sees a renamed table with different columns, which **destroys
every existing photo and video record**. Do not run `drizzle-kit generate` blindly here.

Run `npx drizzle-kit generate --custom` to get an empty migration file, then write it by
hand:

```sql
ALTER TABLE "route_photos" RENAME TO "media";
ALTER TABLE "media" ADD COLUMN "bike_model_id" uuid REFERENCES "bike_models"("id") ON DELETE CASCADE;
ALTER TABLE "media" ALTER COLUMN "route_id" DROP NOT NULL;
ALTER TABLE "media" ADD CONSTRAINT "media_exactly_one_owner" CHECK (num_nonnulls("route_id", "bike_model_id") = 1);
ALTER INDEX "route_photos_route_idx" RENAME TO "media_route_idx";
CREATE INDEX "media_bike_model_idx" ON "media" ("bike_model_id");
```

This preserves every existing row: `route_id` stays set on all of them, `bike_model_id`
stays `null`, and the CHECK constraint is satisfied by every row that already exists.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors. This is the step that catches any consumer file missed in Step 3.

- [ ] **Step 6: Apply the migration to dev, verify, then production**

Apply to dev first. Then run this check against the dev database (via the `execute_sql`
Supabase MCP tool, or `psql`) to confirm no row violates the new constraint and no data
was lost:

```sql
select count(*) from media;                          -- should match the old route_photos count
select count(*) from media where route_id is null;    -- should be 0
```

Only apply to production after the dev check passes.

- [ ] **Step 7: Verify routes still work — this is the real test of this task**

Run: `npm test` (unit suite — confirms `lib/flags.test.ts` and anything else touched still
passes).

Then run the full verification this project always runs before merging a change that
touches a live data path: `npm run lint`, `npm run build`.

This task is the one place in this whole plan where the **existing** Playwright suite
(`tests/browser/`) actually covers what's being changed — `content.spec.ts` and
`geometry.spec.ts` both exercise the routes list and detail pages, which read from the
renamed `media` table. Open the PR for this task and let the `browser` CI check run against
its preview deployment (same as every other PR in this project) — do not merge on `verify`
alone for this specific task, wait for `browser` too, and treat a real (non-flaky) failure
there as this task's regression signal, not just a formality.

That check only reads, though — no CI job in this project uploads a photo through the admin
form. So also do this manually against the same preview or a local dev server
(`npm run dev -- --webpack`), which no automated check will ever catch for us:

1. `/manage/routes/<id>` — the edit form still shows existing media, and uploading a new
   photo still works (confirms `createRouteAction`/`updateRouteAction`/`savePhotosAction`
   write to `media` correctly, not just that reads still work).

Do not consider this task done until that manual write-path check has been done live — a
read-only check, automated or not, would miss a broken insert.

- [ ] **Step 8: Commit**

```bash
git add lib/db/schema.ts lib/db/migrations/ lib/actions/routes.ts lib/routes-data.ts \
  lib/dev-stats.ts "app/[lang]/routes/[id]/page.tsx" components/route-card-media-async.tsx \
  lib/flags.test.ts
git commit -m "Generalize route_photos into a shared media table"
```

---

### Task 5: Pure pricing calculator

**Files:**
- Create: `lib/bike-pricing.ts`
- Test: `lib/bike-pricing.test.ts`

**Interfaces:**
- Consumes: `BikeCategory` type (Task 1).
- Produces: `priceForDay(category: BikeCategory, day: number): number | null`,
  `isRentalDayAllowed(category: BikeCategory, day: number): boolean`.

Kept as a pure function, not inlined into a Server Action, because the same "what does day
N cost for this category" question will be asked again from a future booking flow — and
because pure functions are what this codebase actually unit-tests (see
`lib/media-progress.test.ts`, `lib/gpx.test.ts` for the existing pattern).

- [ ] **Step 1: Write the failing tests**

```ts
// lib/bike-pricing.test.ts
import { describe, it, expect } from 'vitest'
import { priceForDay, isRentalDayAllowed } from './bike-pricing'
import type { BikeCategory } from './db'

function tableCategory(overrides: Partial<BikeCategory> = {}): BikeCategory {
  return {
    id: 'cat-1',
    name: 'Gravel',
    displayOrder: 0,
    maxRentalDays: 5,
    pricingMode: 'table',
    day1Price: '25',
    day2Price: '47',
    day3Price: '68',
    day4Price: '88',
    day5Price: '105',
    day6Price: null,
    day7Price: null,
    perDayAfterPrice: null,
    afternoonPrice: '20',
    ...overrides,
  }
}

function linearCategory(overrides: Partial<BikeCategory> = {}): BikeCategory {
  return {
    id: 'cat-2',
    name: 'Bici classica',
    displayOrder: 0,
    maxRentalDays: 7,
    pricingMode: 'linear',
    day1Price: '15',
    day2Price: null,
    day3Price: null,
    day4Price: null,
    day5Price: null,
    day6Price: null,
    day7Price: null,
    perDayAfterPrice: '10',
    afternoonPrice: null,
    ...overrides,
  }
}

describe('priceForDay', () => {
  it('reads the explicit value for a table-mode category', () => {
    expect(priceForDay(tableCategory(), 3)).toBe(68)
  })

  it('returns null past maxRentalDays even if a price is (wrongly) set', () => {
    expect(priceForDay(tableCategory({ maxRentalDays: 3 }), 4)).toBeNull()
  })

  it('returns null for a table-mode day that was never priced', () => {
    expect(priceForDay(tableCategory(), 6)).toBeNull()
  })

  it('computes a linear-mode day from day1 + perDayAfterPrice', () => {
    const cat = linearCategory()
    expect(priceForDay(cat, 1)).toBe(15)
    expect(priceForDay(cat, 2)).toBe(25)
    expect(priceForDay(cat, 4)).toBe(45)
  })

  it('returns null for day 0 or negative days', () => {
    expect(priceForDay(tableCategory(), 0)).toBeNull()
    expect(priceForDay(tableCategory(), -1)).toBeNull()
  })
})

describe('isRentalDayAllowed', () => {
  it('is true up to maxRentalDays', () => {
    const cat = tableCategory({ maxRentalDays: 5 })
    expect(isRentalDayAllowed(cat, 5)).toBe(true)
    expect(isRentalDayAllowed(cat, 6)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/bike-pricing.test.ts`
Expected: FAIL — `lib/bike-pricing.ts` does not exist yet.

- [ ] **Step 3: Implement**

```ts
// lib/bike-pricing.ts
import type { BikeCategory } from './db'

/**
 * The price for renting a category's bike on rental day N (1-indexed), or
 * null when that day isn't offered — either because it's past
 * `maxRentalDays`, or because a table-mode category left that day's price
 * empty.
 *
 * Prices come back from postgres.js as strings (NUMERIC columns), never
 * numbers — every value here is parsed, not trusted as-is.
 */
export function priceForDay(category: BikeCategory, day: number): number | null {
  if (!isRentalDayAllowed(category, day)) return null

  if (category.pricingMode === 'linear') {
    const day1 = Number(category.day1Price)
    const perDayAfter = category.perDayAfterPrice !== null ? Number(category.perDayAfterPrice) : null
    if (day === 1) return day1
    if (perDayAfter === null) return null
    return day1 + perDayAfter * (day - 1)
  }

  const dayPrices: Record<number, string | null> = {
    1: category.day1Price,
    2: category.day2Price,
    3: category.day3Price,
    4: category.day4Price,
    5: category.day5Price,
    6: category.day6Price,
    7: category.day7Price,
  }
  const raw = dayPrices[day]
  return raw !== null && raw !== undefined ? Number(raw) : null
}

/** Whether a category can be rented for this many days at all. */
export function isRentalDayAllowed(category: BikeCategory, day: number): boolean {
  return day >= 1 && day <= category.maxRentalDays
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/bike-pricing.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add lib/bike-pricing.ts lib/bike-pricing.test.ts
git commit -m "Add pure price-for-day calculator for bike categories"
```

---

### Task 6: Server actions — global options CRUD

**Files:**
- Create: `lib/actions/bike-options.ts`

**Interfaces:**
- Consumes: `bikeSizes`, `bikeVersions`, `bikeCategories` (Task 1), `getAdminUser` (existing
  `lib/supabase/server.ts`).
- Produces: `listBikeSizes()`, `createBikeSizeAction(name, displayOrder)`,
  `updateBikeSizeAction(id, name, displayOrder)`, `deleteBikeSizeAction(id)` — and the same
  three-verb shape for versions and categories. Category create/update additionally take
  the full pricing shape.

- [ ] **Step 1: Write the file**

```ts
'use server'
import { eq, asc } from 'drizzle-orm'
import { db, bikeSizes, bikeVersions, bikeCategories } from '@/lib/db'
import { getAdminUser } from '@/lib/supabase/server'
import { updateTag } from 'next/cache'

async function requireAdmin() {
  const user = await getAdminUser()
  if (!user) throw new Error('Unauthorized')
}

// --- Sizes -------------------------------------------------------------

export async function listBikeSizes() {
  await requireAdmin()
  return db.select().from(bikeSizes).orderBy(asc(bikeSizes.displayOrder))
}

export async function createBikeSizeAction(name: string, displayOrder: number) {
  await requireAdmin()
  await db.insert(bikeSizes).values({ name, displayOrder })
  updateTag('bike-options')
}

export async function updateBikeSizeAction(id: string, name: string, displayOrder: number) {
  await requireAdmin()
  await db.update(bikeSizes).set({ name, displayOrder }).where(eq(bikeSizes.id, id))
  updateTag('bike-options')
}

export async function deleteBikeSizeAction(id: string) {
  await requireAdmin()
  // Relies on the database rejecting this when a bike_model_sizes or
  // bike_units row still references it (no onDelete cascade on that FK,
  // see Task 2/3) — surfaced to the caller as a thrown error, not silently
  // swallowed, so the UI can show why the delete failed.
  await db.delete(bikeSizes).where(eq(bikeSizes.id, id))
  updateTag('bike-options')
}

// --- Versions ------------------------------------------------------------

export async function listBikeVersions() {
  await requireAdmin()
  return db.select().from(bikeVersions).orderBy(asc(bikeVersions.displayOrder))
}

export async function createBikeVersionAction(name: string, displayOrder: number) {
  await requireAdmin()
  await db.insert(bikeVersions).values({ name, displayOrder })
  updateTag('bike-options')
}

export async function updateBikeVersionAction(id: string, name: string, displayOrder: number) {
  await requireAdmin()
  await db.update(bikeVersions).set({ name, displayOrder }).where(eq(bikeVersions.id, id))
  updateTag('bike-options')
}

export async function deleteBikeVersionAction(id: string) {
  await requireAdmin()
  await db.delete(bikeVersions).where(eq(bikeVersions.id, id))
  updateTag('bike-options')
}

// --- Categories ------------------------------------------------------------

export interface BikeCategoryInput {
  name: string
  displayOrder: number
  maxRentalDays: number
  pricingMode: 'table' | 'linear'
  day1Price: string
  day2Price?: string | null
  day3Price?: string | null
  day4Price?: string | null
  day5Price?: string | null
  day6Price?: string | null
  day7Price?: string | null
  perDayAfterPrice?: string | null
  afternoonPrice?: string | null
}

export async function listBikeCategories() {
  await requireAdmin()
  return db.select().from(bikeCategories).orderBy(asc(bikeCategories.displayOrder))
}

export async function createBikeCategoryAction(input: BikeCategoryInput) {
  await requireAdmin()
  await db.insert(bikeCategories).values(input)
  updateTag('bike-options')
}

export async function updateBikeCategoryAction(id: string, input: BikeCategoryInput) {
  await requireAdmin()
  await db.update(bikeCategories).set(input).where(eq(bikeCategories.id, id))
  updateTag('bike-options')
  updateTag('bike-models') // model list shows each model's effective price
}

export async function deleteBikeCategoryAction(id: string) {
  await requireAdmin()
  await db.delete(bikeCategories).where(eq(bikeCategories.id, id))
  updateTag('bike-options')
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors. If `bikeSizes`/`bikeVersions`/`bikeCategories` aren't exported from
`lib/db/index.ts`'s `export * from './schema'` re-export, this fails — that re-export is
already wildcard (`lib/db/index.ts`'s last line), so a new schema export needs no changes
there.

- [ ] **Step 3: Manual verification**

No unit test for this file: it's thin CRUD wrapping Drizzle, exactly like
`lib/actions/routes.ts`'s equivalent functions, which also have no direct unit tests in
this codebase — they're verified through the admin UI (Task 7) and the browser suite.
Verify once Task 7 exists.

- [ ] **Step 4: Commit**

```bash
git add lib/actions/bike-options.ts
git commit -m "Add server actions for bike sizes/versions/categories"
```

---

### Task 7: Admin UI — `/manage/bike-options`

**Files:**
- Create: `components/admin/bike-size-list.tsx`
- Create: `components/admin/bike-version-list.tsx`
- Create: `components/admin/bike-category-list.tsx`
- Create: `components/admin/bike-category-form.tsx`
- Create: `app/manage/bike-options/page.tsx`

**Interfaces:**
- Consumes: everything from `lib/actions/bike-options.ts` (Task 6).

- [ ] **Step 1: `components/admin/bike-size-list.tsx`** (versions list is identical in
shape — see Step 2)

```tsx
'use client'
import { useState, useTransition } from 'react'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import {
  createBikeSizeAction, updateBikeSizeAction, deleteBikeSizeAction,
} from '@/lib/actions/bike-options'
import type { BikeSize } from '@/lib/db'

export function BikeSizeList({ sizes }: { sizes: BikeSize[] }) {
  const [isPending, startTransition] = useTransition()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [newName, setNewName] = useState('')

  function startEdit(size: BikeSize) {
    setEditingId(size.id)
    setDraftName(size.name)
  }

  function saveEdit(id: string, displayOrder: number) {
    startTransition(async () => {
      await updateBikeSizeAction(id, draftName, displayOrder)
      setEditingId(null)
      toast.success('Size updated')
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteBikeSizeAction(id)
        toast.success('Size deleted')
      } catch {
        toast.error('This size is still used by a model or a bike in the shop')
      }
    })
  }

  function handleCreate() {
    if (!newName.trim()) return
    startTransition(async () => {
      await createBikeSizeAction(newName.trim(), sizes.length)
      setNewName('')
      toast.success('Size added')
    })
  }

  return (
    <div className="space-y-2 max-w-md">
      {sizes.map((size) => (
        <div key={size.id} className="flex items-center gap-2 p-2 bg-card border rounded-lg">
          {editingId === size.id ? (
            <>
              <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} className="h-8" />
              <Button size="icon" variant="ghost" disabled={isPending} onClick={() => saveEdit(size.id, size.displayOrder)}>
                <Check size={14} />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}>
                <X size={14} />
              </Button>
            </>
          ) : (
            <>
              <span className="flex-1 text-sm">{size.name}</span>
              <Button size="icon" variant="ghost" onClick={() => startEdit(size)}>
                <Pencil size={14} />
              </Button>
              <Button size="icon" variant="ghost" className="text-destructive" disabled={isPending} onClick={() => handleDelete(size.id)}>
                <Trash2 size={14} />
              </Button>
            </>
          )}
        </div>
      ))}

      <div className="flex items-center gap-2 pt-2">
        <Input
          placeholder="New size (e.g. XL)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="h-8"
        />
        <Button size="icon" variant="outline" disabled={isPending} onClick={handleCreate}>
          <Plus size={14} />
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: `components/admin/bike-version-list.tsx`**

Same file as Step 1, with every `Size`/`size`/`sizes` identifier replaced by
`Version`/`version`/`versions`, and imports from `@/lib/actions/bike-options` swapped to
`createBikeVersionAction, updateBikeVersionAction, deleteBikeVersionAction`, and the type
import to `BikeVersion`. The placeholder text becomes `"New version (e.g. Bambini)"`.

- [ ] **Step 3: `components/admin/bike-category-form.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { BikeCategory } from '@/lib/db'
import type { BikeCategoryInput } from '@/lib/actions/bike-options'

export function BikeCategoryForm({
  category,
  onSubmit,
  onCancel,
}: {
  category?: BikeCategory
  onSubmit: (input: BikeCategoryInput) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(category?.name ?? '')
  const [maxRentalDays, setMaxRentalDays] = useState(category?.maxRentalDays ?? 7)
  const [pricingMode, setPricingMode] = useState<'table' | 'linear'>(category?.pricingMode ?? 'table')
  const [day1Price, setDay1Price] = useState(category?.day1Price ?? '')
  const [day2Price, setDay2Price] = useState(category?.day2Price ?? '')
  const [day3Price, setDay3Price] = useState(category?.day3Price ?? '')
  const [day4Price, setDay4Price] = useState(category?.day4Price ?? '')
  const [day5Price, setDay5Price] = useState(category?.day5Price ?? '')
  const [day6Price, setDay6Price] = useState(category?.day6Price ?? '')
  const [day7Price, setDay7Price] = useState(category?.day7Price ?? '')
  const [perDayAfterPrice, setPerDayAfterPrice] = useState(category?.perDayAfterPrice ?? '')
  const [afternoonPrice, setAfternoonPrice] = useState(category?.afternoonPrice ?? '')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit({
      name,
      displayOrder: category?.displayOrder ?? 0,
      maxRentalDays,
      pricingMode,
      day1Price,
      day2Price: day2Price || null,
      day3Price: day3Price || null,
      day4Price: day4Price || null,
      day5Price: day5Price || null,
      day6Price: day6Price || null,
      day7Price: day7Price || null,
      perDayAfterPrice: perDayAfterPrice || null,
      afternoonPrice: afternoonPrice || null,
    })
  }

  const tableDayFields = [
    { label: 'Day 2', value: day2Price, set: setDay2Price },
    { label: 'Day 3', value: day3Price, set: setDay3Price },
    { label: 'Day 4', value: day4Price, set: setDay4Price },
    { label: 'Day 5', value: day5Price, set: setDay5Price },
    { label: 'Day 6', value: day6Price, set: setDay6Price },
    { label: 'Day 7', value: day7Price, set: setDay7Price },
  ]

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      <div className="space-y-1">
        <Label htmlFor="cat-name">Name *</Label>
        <Input id="cat-name" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="space-y-1">
        <Label htmlFor="cat-max-days">Max rental days *</Label>
        <Input
          id="cat-max-days" type="number" min={1} max={7} required
          value={maxRentalDays}
          onChange={(e) => setMaxRentalDays(Number(e.target.value))}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="cat-pricing-mode">Pricing mode *</Label>
        <Select value={pricingMode} onValueChange={(v) => setPricingMode(v as 'table' | 'linear')}>
          <SelectTrigger id="cat-pricing-mode"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="table">Explicit price per day (1-7)</SelectItem>
            <SelectItem value="linear">Day 1 + flat rate for following days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="cat-day1">Day 1 price *</Label>
        <Input id="cat-day1" type="number" step="0.01" required value={day1Price} onChange={(e) => setDay1Price(e.target.value)} />
      </div>

      {pricingMode === 'table' ? (
        <div className="grid grid-cols-2 gap-3">
          {tableDayFields.map(({ label, value, set }) => (
            <div key={label} className="space-y-1">
              <Label>{label}</Label>
              <Input type="number" step="0.01" value={value ?? ''} onChange={(e) => set(e.target.value)} placeholder="not offered" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          <Label htmlFor="cat-per-day">Flat rate for each day after day 1 *</Label>
          <Input
            id="cat-per-day" type="number" step="0.01" required
            value={perDayAfterPrice ?? ''}
            onChange={(e) => setPerDayAfterPrice(e.target.value)}
          />
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor="cat-afternoon">Afternoon / half-day price</Label>
        <Input id="cat-afternoon" type="number" step="0.01" value={afternoonPrice ?? ''} onChange={(e) => setAfternoonPrice(e.target.value)} placeholder="optional" />
      </div>

      <div className="flex gap-3">
        <Button type="submit">{category ? 'Update category' : 'Create category'}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 4: `components/admin/bike-category-list.tsx`**

```tsx
'use client'
import { useState, useTransition } from 'react'
import { Pencil, Trash2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  createBikeCategoryAction, updateBikeCategoryAction, deleteBikeCategoryAction,
  type BikeCategoryInput,
} from '@/lib/actions/bike-options'
import { BikeCategoryForm } from './bike-category-form'
import type { BikeCategory } from '@/lib/db'

export function BikeCategoryList({ categories }: { categories: BikeCategory[] }) {
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState<BikeCategory | 'new' | null>(null)

  function handleSubmit(input: BikeCategoryInput) {
    startTransition(async () => {
      if (editing && editing !== 'new') {
        await updateBikeCategoryAction(editing.id, input)
        toast.success('Category updated')
      } else {
        await createBikeCategoryAction(input)
        toast.success('Category created')
      }
      setEditing(null)
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteBikeCategoryAction(id)
        toast.success('Category deleted')
      } catch {
        toast.error('This category is still used by a model')
      }
    })
  }

  if (editing) {
    return (
      <BikeCategoryForm
        category={editing === 'new' ? undefined : editing}
        onSubmit={handleSubmit}
        onCancel={() => setEditing(null)}
      />
    )
  }

  return (
    <div className="space-y-2 max-w-2xl">
      {categories.map((cat) => (
        <div key={cat.id} className="flex items-center justify-between p-3 bg-card border rounded-lg">
          <div className="space-y-1">
            <p className="font-medium text-sm">{cat.name}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">{cat.pricingMode === 'table' ? 'Day-by-day' : 'Linear'}</Badge>
              <span>max {cat.maxRentalDays} days</span>
              <span>day 1: {cat.day1Price}</span>
            </div>
          </div>
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" onClick={() => setEditing(cat)}>
              <Pencil size={14} />
            </Button>
            <Button size="icon" variant="ghost" className="text-destructive" disabled={isPending} onClick={() => handleDelete(cat.id)}>
              <Trash2 size={14} />
            </Button>
          </div>
        </div>
      ))}

      <Button variant="outline" onClick={() => setEditing('new')} className="gap-1">
        <Plus size={14} /> New category
      </Button>
    </div>
  )
}
```

- [ ] **Step 5: `app/manage/bike-options/page.tsx`**

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getAdminUser } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { listBikeSizes, listBikeVersions, listBikeCategories } from '@/lib/actions/bike-options'
import { BikeSizeList } from '@/components/admin/bike-size-list'
import { BikeVersionList } from '@/components/admin/bike-version-list'
import { BikeCategoryList } from '@/components/admin/bike-category-list'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function BikeOptionsPage() {
  const user = await getAdminUser()
  if (!user) redirect('/manage/login')

  const [sizes, versions, categories] = await Promise.all([
    listBikeSizes(),
    listBikeVersions(),
    listBikeCategories(),
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#1e3a5f]">Bike options</h1>
      <Tabs defaultValue="sizes">
        <TabsList>
          <TabsTrigger value="sizes">Sizes</TabsTrigger>
          <TabsTrigger value="versions">Versions</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>
        <TabsContent value="sizes"><BikeSizeList sizes={sizes} /></TabsContent>
        <TabsContent value="versions"><BikeVersionList versions={versions} /></TabsContent>
        <TabsContent value="categories"><BikeCategoryList categories={categories} /></TabsContent>
      </Tabs>
    </div>
  )
}
```

Before this step, confirm `components/ui/tabs.tsx` exists (`npx shadcn@latest add tabs` if
not — check first, this project has most shadcn primitives already installed).

- [ ] **Step 6: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: no errors, no new warnings.

- [ ] **Step 7: Manual verification**

Start the dev server, log in as admin, visit `/manage/bike-options`. Create a size, edit
it, delete it (confirm it's gone). Repeat for a version. Create a category in `table` mode
with a few day prices, then one in `linear` mode with day1 + flat rate — confirm both save
and redisplay correctly. Try deleting a category that a model uses (once Task 9 exists) and
confirm the error toast appears instead of a crash.

- [ ] **Step 8: Commit**

```bash
git add components/admin/bike-size-list.tsx components/admin/bike-version-list.tsx \
  components/admin/bike-category-list.tsx components/admin/bike-category-form.tsx \
  app/manage/bike-options/page.tsx
git commit -m "Add /manage/bike-options admin page"
```

---

### Task 8: Generalize `MediaUpload` for reuse

**Files:**
- Modify: `components/admin/media-upload.tsx`
- Modify: `components/admin/route-form.tsx`

**Interfaces:**
- Produces: `MediaUpload` now takes `ownerId`, `getPresignedUploadUrl`, and
  `getVideoPresignedUploadUrl` as props instead of importing routes' actions directly, so
  Task 11's bike model form can reuse it with different actions and R2 key prefixes.

- [ ] **Step 1: Change the props and remove the hardcoded imports**

In `components/admin/media-upload.tsx`, find:

```ts
import { getPresignedUploadUrlAction, getVideoPresignedUploadUrlAction } from '@/lib/actions/routes'
```

Delete that import entirely — the component must not know about routes specifically
anymore.

Find:

```ts
export function MediaUpload({
  routeId,
  defaultItems = [],
}: {
  routeId: string
  defaultItems?: { storageKey: string; mediaType: 'photo' | 'video' }[]
}) {
```

Replace with:

```ts
export function MediaUpload({
  ownerId,
  defaultItems = [],
  getPresignedUploadUrl,
  getVideoPresignedUploadUrl,
}: {
  ownerId: string
  defaultItems?: { storageKey: string; mediaType: 'photo' | 'video' }[]
  getPresignedUploadUrl: (ownerId: string, fileName: string, contentType: string, type: 'photo') => Promise<{ url: string; key: string }>
  getVideoPresignedUploadUrl: (ownerId: string, fileName: string, contentType: string) => Promise<{ url: string; key: string }>
}) {
```

- [ ] **Step 2: Update every reference to `routeId` inside the component body**

Find:

```ts
  const effectiveRouteId = useRef(
    routeId !== 'new' ? routeId : (() => {
```

Replace with:

```ts
  const effectiveOwnerId = useRef(
    ownerId !== 'new' ? ownerId : (() => {
```

Find, later in the same block, the closing `).current` line — no change needed there, only
the variable name changes throughout its remaining uses.

Find:

```ts
      const result = isVideo
        ? await getVideoPresignedUploadUrlAction(effectiveRouteId, file.name, file.type)
        : await getPresignedUploadUrlAction(effectiveRouteId, file.name, file.type, 'photo')
```

Replace with:

```ts
      const result = isVideo
        ? await getVideoPresignedUploadUrl(effectiveOwnerId, file.name, file.type)
        : await getPresignedUploadUrl(effectiveOwnerId, file.name, file.type, 'photo')
```

Find the `useCallback` dependency array for `uploadFile`:

```ts
  }, [effectiveRouteId])
```

Replace with:

```ts
  }, [effectiveOwnerId, getPresignedUploadUrl, getVideoPresignedUploadUrl])
```

- [ ] **Step 3: Update the call site in `route-form.tsx`**

Find:

```tsx
        <MediaUpload
          routeId={route?.id ?? 'new'}
          defaultItems={photos?.map((p) => ({ storageKey: p.storageKey, mediaType: p.mediaType })) ?? []}
        />
```

Replace with:

```tsx
        <MediaUpload
          ownerId={route?.id ?? 'new'}
          defaultItems={photos?.map((p) => ({ storageKey: p.storageKey, mediaType: p.mediaType })) ?? []}
          getPresignedUploadUrl={getPresignedUploadUrlAction}
          getVideoPresignedUploadUrl={getVideoPresignedUploadUrlAction}
        />
```

Add the now-needed import at the top of `route-form.tsx`:

```ts
import { getPresignedUploadUrlAction, getVideoPresignedUploadUrlAction } from '@/lib/actions/routes'
```

(`route-form.tsx` already imports other things from `@/lib/actions/routes` via the
`RouteFormState` type import — add these two alongside it, don't create a second import
line for the same module.)

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Manual verification — routes media upload still works**

Start the dev server, go to `/manage/routes/<id>`, upload a new photo and a new video.
Confirm both appear in the list with progress bars exactly as before this change — this
component has no unit tests (confirmed absent when this plan was written), so this manual
check is the only verification available.

- [ ] **Step 6: Commit**

```bash
git add components/admin/media-upload.tsx components/admin/route-form.tsx
git commit -m "Generalize MediaUpload to accept injected upload actions"
```

---

### Task 9: Server actions — bike model catalog CRUD

**Files:**
- Create: `lib/actions/bike-models.ts`

**Interfaces:**
- Consumes: `bikeModels`, `bikeModelTranslations`, `bikeModelSizes`, `bikeModelVersions`,
  `media` (Tasks 2, 4); `translateFromItalian` (existing `lib/actions/translate.ts`);
  `needsRetranslation` (existing `lib/translations.ts`); `getPresignedUploadUrl`,
  `getVideoPresignedUploadUrl` (existing `lib/r2.ts`, `lib/media.ts`).
- Produces: `getBikeModelsForAdmin()`, `getBikeModelWithDetails(id)`,
  `createBikeModelAction(prev, formData)`, `updateBikeModelAction(id, prev, formData)`,
  `deleteBikeModelAction(id)`, `togglePublishBikeModelAction(id, isPublished)`,
  `getBikeModelPresignedUploadUrlAction`, `getBikeModelVideoPresignedUploadUrlAction`.

This mirrors `lib/actions/routes.ts` closely — same Zod-validated form-state pattern, same
translation regeneration logic, same R2 key-prefix convention (`bike-model-photos/` and
`private/bike-model-videos/` instead of `route-photos/`/`private/route-videos/`).

- [ ] **Step 1: Write the file**

```ts
'use server'
import { updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import {
  db, bikeModels, bikeModelTranslations, bikeModelSizes, bikeModelVersions, media,
} from '@/lib/db'
import { getAdminUser } from '@/lib/supabase/server'
import { translateFromItalian } from './translate'
import { deleteR2Object, getPresignedUploadUrl } from '@/lib/r2'
import { getVideoPresignedUploadUrl, deleteR2Prefix, deriveHlsPrefix } from '@/lib/media'
import { needsRetranslation } from '@/lib/translations'

const BikeModelSchema = z.object({
  nameIt:          z.string().min(2).max(200),
  descriptionIt:   z.string().min(10),
  categoryId:      z.string().uuid(),
  priceSurcharge:  z.coerce.number().nonnegative().optional(),
  batteryRange:    z.string().optional(),
  motor:           z.string().optional(),
  gearCount:       z.string().optional(),
  sizeIds:         z.array(z.string().uuid()).min(1, 'Select at least one size'),
  versionIds:      z.array(z.string().uuid()).min(1, 'Select at least one version'),
})

export type BikeModelFormState = {
  errors?: Partial<Record<keyof z.infer<typeof BikeModelSchema>, string[]>>
  message?: string
}

async function requireAdmin() {
  const user = await getAdminUser()
  if (!user) throw new Error('Unauthorized')
}

export async function getBikeModelsForAdmin() {
  await requireAdmin()
  return db
    .select({ model: bikeModels, name: bikeModelTranslations.name })
    .from(bikeModels)
    .leftJoin(
      bikeModelTranslations,
      and(eq(bikeModelTranslations.bikeModelId, bikeModels.id), eq(bikeModelTranslations.locale, 'it'))
    )
    .orderBy(desc(bikeModels.createdAt))
}

export async function getBikeModelWithDetails(id: string) {
  await requireAdmin()
  const [model] = await db.select().from(bikeModels).where(eq(bikeModels.id, id))
  if (!model) return null

  const translations = await db.select().from(bikeModelTranslations).where(eq(bikeModelTranslations.bikeModelId, id))
  const sizeLinks = await db.select().from(bikeModelSizes).where(eq(bikeModelSizes.bikeModelId, id))
  const versionLinks = await db.select().from(bikeModelVersions).where(eq(bikeModelVersions.bikeModelId, id))
  const photos = await db.select().from(media).where(eq(media.bikeModelId, id))

  return {
    model,
    translations,
    sizeIds: sizeLinks.map((l) => l.bikeSizeId),
    versionIds: versionLinks.map((l) => l.bikeVersionId),
    photos,
  }
}

function parseBikeModelForm(formData: FormData) {
  return BikeModelSchema.safeParse({
    nameIt:         formData.get('nameIt'),
    descriptionIt:  formData.get('descriptionIt'),
    categoryId:     formData.get('categoryId'),
    priceSurcharge: formData.get('priceSurcharge') || undefined,
    batteryRange:   formData.get('batteryRange') || undefined,
    motor:          formData.get('motor') || undefined,
    gearCount:      formData.get('gearCount') || undefined,
    sizeIds:        formData.getAll('sizeIds'),
    versionIds:     formData.getAll('versionIds'),
  })
}

async function syncMediaItems(bikeModelId: string, formData: FormData) {
  const mediaItemsRaw = formData.get('mediaItems') as string | null
  const mediaItems: { key: string; type: 'photo' | 'video' }[] = mediaItemsRaw ? JSON.parse(mediaItemsRaw) : []

  const existing = await db.select().from(media).where(eq(media.bikeModelId, bikeModelId))
  const newKeys = new Set(mediaItems.map((i) => i.key))
  const removed = existing.filter((m) => !newKeys.has(m.storageKey))
  await Promise.all(removed.map((m) =>
    m.mediaType === 'video'
      ? Promise.all([deleteR2Object(m.storageKey), deleteR2Prefix(deriveHlsPrefix(m.storageKey))])
      : deleteR2Object(m.storageKey)
  ))

  await db.delete(media).where(eq(media.bikeModelId, bikeModelId))
  if (mediaItems.length > 0) {
    await db.insert(media).values(
      mediaItems.map(({ key, type }, displayOrder) => ({
        bikeModelId, storageKey: key, mediaType: type, displayOrder,
      }))
    )
  }
}

async function syncSizesAndVersions(bikeModelId: string, sizeIds: string[], versionIds: string[]) {
  await db.delete(bikeModelSizes).where(eq(bikeModelSizes.bikeModelId, bikeModelId))
  await db.insert(bikeModelSizes).values(sizeIds.map((bikeSizeId) => ({ bikeModelId, bikeSizeId })))

  await db.delete(bikeModelVersions).where(eq(bikeModelVersions.bikeModelId, bikeModelId))
  await db.insert(bikeModelVersions).values(versionIds.map((bikeVersionId) => ({ bikeModelId, bikeVersionId })))
}

export async function createBikeModelAction(
  _prev: BikeModelFormState,
  formData: FormData
): Promise<BikeModelFormState> {
  await requireAdmin()

  const parsed = parseBikeModelForm(formData)
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors }

  const { nameIt, descriptionIt, sizeIds, versionIds, ...modelData } = parsed.data

  const [newModel] = await db.insert(bikeModels).values({
    categoryId:     modelData.categoryId,
    priceSurcharge: modelData.priceSurcharge?.toString(),
    batteryRange:   modelData.batteryRange || null,
    motor:          modelData.motor || null,
    gearCount:      modelData.gearCount || null,
  }).returning()

  const [nameTranslations, descTranslations] = await Promise.all([
    translateFromItalian(nameIt),
    translateFromItalian(descriptionIt),
  ])

  await db.insert(bikeModelTranslations).values([
    { bikeModelId: newModel.id, locale: 'it', name: nameIt, description: descriptionIt, isAutoTranslated: false },
    { bikeModelId: newModel.id, locale: 'en', name: nameTranslations.en, description: descTranslations.en, isAutoTranslated: true },
    { bikeModelId: newModel.id, locale: 'de', name: nameTranslations.de, description: descTranslations.de, isAutoTranslated: true },
  ])

  await syncSizesAndVersions(newModel.id, sizeIds, versionIds)
  await syncMediaItems(newModel.id, formData)

  updateTag('bike-models')
  redirect('/manage/bikes')
}

export async function updateBikeModelAction(
  id: string,
  _prev: BikeModelFormState,
  formData: FormData
): Promise<BikeModelFormState> {
  await requireAdmin()

  const parsed = parseBikeModelForm(formData)
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors }

  const { nameIt, descriptionIt, sizeIds, versionIds, ...modelData } = parsed.data

  await db.update(bikeModels).set({
    categoryId:     modelData.categoryId,
    priceSurcharge: modelData.priceSurcharge?.toString(),
    batteryRange:   modelData.batteryRange || null,
    motor:          modelData.motor || null,
    gearCount:      modelData.gearCount || null,
    updatedAt:      new Date(),
  }).where(eq(bikeModels.id, id))

  const [currentIt] = await db.select().from(bikeModelTranslations).where(
    and(eq(bikeModelTranslations.bikeModelId, id), eq(bikeModelTranslations.locale, 'it'))
  )
  const reTranslate = needsRetranslation(
    currentIt ? { name: currentIt.name, description: currentIt.description } : undefined,
    { name: nameIt, description: descriptionIt },
    formData.get('retranslate') === 'true'
  )
  if (reTranslate) {
    const [nameT, descT] = await Promise.all([
      translateFromItalian(nameIt),
      translateFromItalian(descriptionIt),
    ])
    for (const [locale, name, desc, isAuto] of [
      ['it', nameIt, descriptionIt, false],
      ['en', nameT.en, descT.en, true],
      ['de', nameT.de, descT.de, true],
    ] as const) {
      await db
        .update(bikeModelTranslations)
        .set({ name, description: desc, isAutoTranslated: isAuto })
        .where(and(eq(bikeModelTranslations.bikeModelId, id), eq(bikeModelTranslations.locale, locale)))
    }
  } else {
    await db
      .update(bikeModelTranslations)
      .set({ name: nameIt, description: descriptionIt })
      .where(and(eq(bikeModelTranslations.bikeModelId, id), eq(bikeModelTranslations.locale, 'it')))
  }

  await syncSizesAndVersions(id, sizeIds, versionIds)
  await syncMediaItems(id, formData)

  updateTag('bike-models')
  updateTag(`bike-model-${id}`)
  redirect('/manage/bikes')
}

export async function deleteBikeModelAction(id: string) {
  await requireAdmin()

  const items = await db.select().from(media).where(eq(media.bikeModelId, id))
  await Promise.all(items.map((m) =>
    m.mediaType === 'video'
      ? Promise.all([deleteR2Object(m.storageKey), deleteR2Prefix(deriveHlsPrefix(m.storageKey))])
      : deleteR2Object(m.storageKey)
  ))

  // Fails loudly (thrown error, caught by the caller) if any bike_units row
  // still references this model — no cascade on that foreign key, by design.
  await db.delete(bikeModels).where(eq(bikeModels.id, id))
  updateTag('bike-models')
}

export async function togglePublishBikeModelAction(id: string, isPublished: boolean) {
  await requireAdmin()
  await db.update(bikeModels).set({ isPublished, updatedAt: new Date() }).where(eq(bikeModels.id, id))
  updateTag('bike-models')
  updateTag(`bike-model-${id}`)
}

export async function getBikeModelPresignedUploadUrlAction(
  bikeModelId: string,
  fileName: string,
  contentType: string,
  _type: 'photo'
) {
  await requireAdmin()
  const ext = fileName.split('.').pop()
  const key = `bike-model-photos/${bikeModelId}/${crypto.randomUUID()}.${ext}`
  const url = await getPresignedUploadUrl(key, contentType)
  return { url, key }
}

export async function getBikeModelVideoPresignedUploadUrlAction(
  bikeModelId: string,
  fileName: string,
  contentType: string
) {
  await requireAdmin()
  const ext = fileName.split('.').pop() ?? 'mp4'
  const key = `private/bike-model-videos/${bikeModelId}/${crypto.randomUUID()}.${ext}`
  const url = await getVideoPresignedUploadUrl(key, contentType)
  return { url, key }
}
```

Note: `getBikeModelPresignedUploadUrlAction`'s signature matches the
`getPresignedUploadUrl` prop shape `MediaUpload` expects from Task 8
(`(ownerId, fileName, contentType, type: 'photo') => Promise<{ url, key }>`) — the unused
`_type` parameter exists only so the signature lines up; every call from `MediaUpload` for
a photo passes `'photo'` and there is no other type to branch on here (GPX doesn't apply to
bike models).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Manual verification**

No dedicated unit test — same reasoning as Task 6, this is thin CRUD verified through the
UI in Tasks 10-11.

- [ ] **Step 4: Commit**

```bash
git add lib/actions/bike-models.ts
git commit -m "Add server actions for bike model catalog CRUD"
```

---

### Task 10: Admin UI — `/manage/bikes` list

**Files:**
- Create: `components/admin/bike-model-list-item.tsx`
- Create: `app/manage/bikes/page.tsx`

**Interfaces:**
- Consumes: `getBikeModelsForAdmin`, `deleteBikeModelAction`, `togglePublishBikeModelAction`
  (Task 9).

- [ ] **Step 1: `components/admin/bike-model-list-item.tsx`**

```tsx
'use client'
import { useTransition } from 'react'
import Link from 'next/link'
import { Pencil, Trash2, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { deleteBikeModelAction, togglePublishBikeModelAction } from '@/lib/actions/bike-models'
import type { BikeModel } from '@/lib/db'

export function BikeModelListItem({ model, name }: { model: BikeModel; name: string }) {
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteBikeModelAction(model.id)
        toast.success('Model deleted')
      } catch {
        toast.error('This model still has bikes in the shop — remove those first')
      }
    })
  }

  function handleTogglePublish() {
    startTransition(async () => {
      await togglePublishBikeModelAction(model.id, !model.isPublished)
      toast.success(model.isPublished ? 'Model hidden' : 'Model published')
    })
  }

  return (
    <div className="flex items-center justify-between p-4 bg-card border rounded-lg">
      <div className="space-y-1 min-w-0">
        <p className="font-medium text-[#1e3a5f] truncate">{name}</p>
        <Badge variant={model.isPublished ? 'default' : 'secondary'}>
          {model.isPublished ? 'Published' : 'Draft'}
        </Badge>
      </div>

      <div className="flex items-center gap-2 shrink-0 ml-4">
        <Button variant="ghost" size="icon" onClick={handleTogglePublish} disabled={isPending} title={model.isPublished ? 'Hide' : 'Publish'}>
          {model.isPublished ? <EyeOff size={16} /> : <Eye size={16} />}
        </Button>

        <Button variant="ghost" size="icon" asChild>
          <Link href={`/manage/bikes/${model.id}`}><Pencil size={16} /></Link>
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
              <Trash2 size={16} />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete model?</AlertDialogTitle>
              <AlertDialogDescription>
                This action is irreversible. All photos and videos for this model will also
                be deleted. Blocked if any physical bike in the shop still uses this model.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: `app/manage/bikes/page.tsx`**

```tsx
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { getBikeModelsForAdmin } from '@/lib/actions/bike-models'
import { getAdminUser } from '@/lib/supabase/server'
import { BikeModelListItem } from '@/components/admin/bike-model-list-item'
import { redirect } from 'next/navigation'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function AdminBikeModelsPage() {
  const user = await getAdminUser()
  if (!user) redirect('/manage/login')

  const models = await getBikeModelsForAdmin()

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#1e3a5f]">Bike models</h1>
        <Button asChild className="bg-[#1e3a5f] hover:bg-[#152c4a]">
          <Link href="/manage/bikes/new"><Plus size={16} className="mr-1" /> New model</Link>
        </Button>
      </div>

      {models.length === 0 ? (
        <p className="text-muted-foreground text-sm">No models yet. Create the first one!</p>
      ) : (
        <div className="space-y-3">
          {models.map(({ model, name }) => (
            <BikeModelListItem key={model.id} model={model} name={name ?? 'Untitled'} />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: no errors, no new warnings.

- [ ] **Step 4: Commit**

```bash
git add components/admin/bike-model-list-item.tsx app/manage/bikes/page.tsx
git commit -m "Add /manage/bikes list page"
```

---

### Task 11: Admin UI — bike model create/edit form

**Files:**
- Create: `components/admin/bike-model-form.tsx`
- Create: `app/manage/bikes/new/page.tsx`
- Create: `app/manage/bikes/[id]/page.tsx`

**Interfaces:**
- Consumes: `createBikeModelAction`, `updateBikeModelAction`, `getBikeModelWithDetails`,
  `getBikeModelPresignedUploadUrlAction`, `getBikeModelVideoPresignedUploadUrlAction` (Task
  9); `listBikeCategories`, `listBikeSizes`, `listBikeVersions` (Task 6); `MediaUpload`
  (Task 8, generalized).

- [ ] **Step 1: `components/admin/bike-model-form.tsx`**

```tsx
'use client'
import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { MediaUpload } from './media-upload'
import {
  getBikeModelPresignedUploadUrlAction, getBikeModelVideoPresignedUploadUrlAction,
  type BikeModelFormState,
} from '@/lib/actions/bike-models'
import type { BikeModel, BikeModelTranslation, Media, BikeCategory, BikeSize, BikeVersion } from '@/lib/db'

interface BikeModelFormProps {
  action: (prev: BikeModelFormState, formData: FormData) => Promise<BikeModelFormState>
  categories: BikeCategory[]
  sizes: BikeSize[]
  versions: BikeVersion[]
  model?: BikeModel
  translations?: BikeModelTranslation[]
  photos?: Media[]
  selectedSizeIds?: string[]
  selectedVersionIds?: string[]
}

export function BikeModelForm({
  action, categories, sizes, versions, model, translations, photos,
  selectedSizeIds, selectedVersionIds,
}: BikeModelFormProps) {
  const [state, formAction, isPending] = useActionState(action, {})
  const itTranslation = translations?.find((t) => t.locale === 'it')

  const [nameIt, setNameIt] = useState(itTranslation?.name ?? '')
  const [descriptionIt, setDescriptionIt] = useState(itTranslation?.description ?? '')
  const [categoryId, setCategoryId] = useState(model?.categoryId ?? categories[0]?.id ?? '')
  const [priceSurcharge, setPriceSurcharge] = useState(model?.priceSurcharge ?? '')
  const [batteryRange, setBatteryRange] = useState(model?.batteryRange ?? '')
  const [motor, setMotor] = useState(model?.motor ?? '')
  const [gearCount, setGearCount] = useState(model?.gearCount ?? '')
  const [sizeIds, setSizeIds] = useState<string[]>(selectedSizeIds ?? [])
  const [versionIds, setVersionIds] = useState<string[]>(selectedVersionIds ?? [])

  function toggleSize(id: string, checked: boolean) {
    setSizeIds((prev) => checked ? [...prev, id] : prev.filter((s) => s !== id))
  }

  function toggleVersion(id: string, checked: boolean) {
    setVersionIds((prev) => checked ? [...prev, id] : prev.filter((v) => v !== id))
  }

  return (
    <form action={formAction} className="space-y-8 max-w-2xl">
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[#1e3a5f]">Content (Italian)</h2>
        <p className="text-sm text-muted-foreground">EN and DE are regenerated whenever the Italian text changes.</p>

        <div className="space-y-1">
          <Label htmlFor="nameIt">Model name *</Label>
          <Input id="nameIt" name="nameIt" required value={nameIt} onChange={(e) => setNameIt(e.target.value)} />
          {state.errors?.nameIt && <p className="text-xs text-destructive">{state.errors.nameIt[0]}</p>}
        </div>

        <div className="space-y-1">
          <Label htmlFor="descriptionIt">Description *</Label>
          <Textarea id="descriptionIt" name="descriptionIt" rows={5} required value={descriptionIt} onChange={(e) => setDescriptionIt(e.target.value)} />
          {state.errors?.descriptionIt && <p className="text-xs text-destructive">{state.errors.descriptionIt[0]}</p>}
        </div>

        {model && (
          <div className="flex items-center gap-2 text-sm">
            <Switch name="retranslate" id="retranslate" value="true" />
            <Label htmlFor="retranslate">Regenerate even if the Italian is unchanged</Label>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[#1e3a5f]">Category and price</h2>
        <div className="space-y-1">
          <Label htmlFor="categoryId">Category *</Label>
          <Select name="categoryId" value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger id="categoryId"><SelectValue /></SelectTrigger>
            <SelectContent>
              {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {state.errors?.categoryId && <p className="text-xs text-destructive">{state.errors.categoryId[0]}</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor="priceSurcharge">Surcharge over category price</Label>
          <Input
            id="priceSurcharge" name="priceSurcharge" type="number" step="0.01" min="0"
            value={priceSurcharge ?? ''} onChange={(e) => setPriceSurcharge(e.target.value)}
            placeholder="optional, e.g. carbon frame"
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[#1e3a5f]">Specifications</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label htmlFor="batteryRange">Battery range</Label>
            <Input id="batteryRange" name="batteryRange" value={batteryRange ?? ''} onChange={(e) => setBatteryRange(e.target.value)} placeholder="es. 80 km" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="motor">Motor</Label>
            <Input id="motor" name="motor" value={motor ?? ''} onChange={(e) => setMotor(e.target.value)} placeholder="es. Bosch CX" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="gearCount">Gears</Label>
            <Input id="gearCount" name="gearCount" value={gearCount ?? ''} onChange={(e) => setGearCount(e.target.value)} placeholder="es. Shimano 12v" />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[#1e3a5f]">Sizes *</h2>
        {state.errors?.sizeIds && <p className="text-xs text-destructive">{state.errors.sizeIds[0]}</p>}
        <div className="flex flex-wrap gap-4">
          {sizes.map((size) => (
            <div key={size.id} className="flex items-center gap-2">
              <Checkbox
                id={`size-${size.id}`} name="sizeIds" value={size.id}
                checked={sizeIds.includes(size.id)}
                onCheckedChange={(checked) => toggleSize(size.id, !!checked)}
              />
              <Label htmlFor={`size-${size.id}`} className="font-normal">{size.name}</Label>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[#1e3a5f]">Versions *</h2>
        {state.errors?.versionIds && <p className="text-xs text-destructive">{state.errors.versionIds[0]}</p>}
        <div className="flex flex-wrap gap-4">
          {versions.map((version) => (
            <div key={version.id} className="flex items-center gap-2">
              <Checkbox
                id={`version-${version.id}`} name="versionIds" value={version.id}
                checked={versionIds.includes(version.id)}
                onCheckedChange={(checked) => toggleVersion(version.id, !!checked)}
              />
              <Label htmlFor={`version-${version.id}`} className="font-normal">{version.name}</Label>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[#1e3a5f]">Photos and video</h2>
        <p className="text-sm text-muted-foreground">The first item is the cover. Drag to reorder.</p>
        <MediaUpload
          ownerId={model?.id ?? 'new'}
          defaultItems={photos?.map((p) => ({ storageKey: p.storageKey, mediaType: p.mediaType })) ?? []}
          getPresignedUploadUrl={getBikeModelPresignedUploadUrlAction}
          getVideoPresignedUploadUrl={getBikeModelVideoPresignedUploadUrlAction}
        />
      </section>

      {state.message && <p className="text-sm text-destructive">{state.message}</p>}

      <div className="flex gap-3">
        <Button type="submit" className="bg-[#1e3a5f] hover:bg-[#152c4a]" disabled={isPending}>
          {isPending ? 'Saving...' : model ? 'Update model' : 'Create model'}
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: `app/manage/bikes/new/page.tsx`**

```tsx
import { BikeModelForm } from '@/components/admin/bike-model-form'
import { createBikeModelAction } from '@/lib/actions/bike-models'
import { listBikeCategories, listBikeSizes, listBikeVersions } from '@/lib/actions/bike-options'
import { getAdminUser } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function NewBikeModelPage() {
  const user = await getAdminUser()
  if (!user) redirect('/manage/login')

  const [categories, sizes, versions] = await Promise.all([
    listBikeCategories(), listBikeSizes(), listBikeVersions(),
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#1e3a5f]">New bike model</h1>
      <BikeModelForm action={createBikeModelAction} categories={categories} sizes={sizes} versions={versions} />
    </div>
  )
}
```

- [ ] **Step 3: `app/manage/bikes/[id]/page.tsx`**

```tsx
import { BikeModelForm } from '@/components/admin/bike-model-form'
import { updateBikeModelAction, getBikeModelWithDetails } from '@/lib/actions/bike-models'
import { listBikeCategories, listBikeSizes, listBikeVersions } from '@/lib/actions/bike-options'
import { getAdminUser } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function EditBikeModelPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getAdminUser()
  if (!user) redirect('/manage/login')

  const { id } = await params
  const [data, categories, sizes, versions] = await Promise.all([
    getBikeModelWithDetails(id), listBikeCategories(), listBikeSizes(), listBikeVersions(),
  ])
  if (!data) notFound()

  const action = updateBikeModelAction.bind(null, id)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#1e3a5f]">Edit bike model</h1>
      <BikeModelForm
        action={action}
        categories={categories} sizes={sizes} versions={versions}
        model={data.model} translations={data.translations} photos={data.photos}
        selectedSizeIds={data.sizeIds} selectedVersionIds={data.versionIds}
      />
    </div>
  )
}
```

- [ ] **Step 4: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: no errors, no new warnings.

- [ ] **Step 5: Manual verification**

Create a model with all fields, at least one size and one version, and upload a photo and
a video. Confirm it appears in `/manage/bikes`, publish it, edit it (confirm the form
prefills correctly including the checked sizes/versions), confirm EN/DE translations were
generated (check via the database or a future public page — for now, checking the
`bike_model_translations` rows directly is enough).

- [ ] **Step 6: Commit**

```bash
git add components/admin/bike-model-form.tsx app/manage/bikes/new/page.tsx "app/manage/bikes/[id]/page.tsx"
git commit -m "Add bike model create/edit form"
```

---

### Task 12: Server actions — shop inventory CRUD

**Files:**
- Create: `lib/actions/bike-units.ts`

**Interfaces:**
- Consumes: `bikeUnits`, `bikeModels`, `bikeModelTranslations`, `bikeModelSizes`,
  `bikeModelVersions`, `bikeSizes`, `bikeVersions` (Tasks 1-3).
- Produces: `getBikeUnitsForAdmin()`, `getPublishedModelsWithAllowedOptions()`,
  `createBikeUnitAction(bikeModelId, bikeSizeId, bikeVersionId)`,
  `deleteBikeUnitAction(id)`.

- [ ] **Step 1: Write the file**

```ts
'use server'
import { eq, and, desc } from 'drizzle-orm'
import {
  db, bikeUnits, bikeModels, bikeModelTranslations, bikeModelSizes, bikeModelVersions,
  bikeSizes, bikeVersions,
} from '@/lib/db'
import { getAdminUser } from '@/lib/supabase/server'
import { updateTag } from 'next/cache'

async function requireAdmin() {
  const user = await getAdminUser()
  if (!user) throw new Error('Unauthorized')
}

export async function getBikeUnitsForAdmin() {
  await requireAdmin()
  return db
    .select({
      unit: bikeUnits,
      modelName: bikeModelTranslations.name,
      sizeName: bikeSizes.name,
      versionName: bikeVersions.name,
    })
    .from(bikeUnits)
    .leftJoin(
      bikeModelTranslations,
      and(eq(bikeModelTranslations.bikeModelId, bikeUnits.bikeModelId), eq(bikeModelTranslations.locale, 'it'))
    )
    .innerJoin(bikeSizes, eq(bikeSizes.id, bikeUnits.bikeSizeId))
    .innerJoin(bikeVersions, eq(bikeVersions.id, bikeUnits.bikeVersionId))
    .orderBy(desc(bikeUnits.createdAt))
}

/**
 * Every published model, each with the subset of global sizes/versions it
 * actually allows — exactly what "Il mio negozio"'s add-a-bike form needs to
 * restrict its two dropdowns once a model is picked. One query per list
 * (models, then their size/version links), not one query per model: the
 * same N+1 shape that hung /routes twice must not be reintroduced here.
 */
export async function getPublishedModelsWithAllowedOptions() {
  await requireAdmin()

  const models = await db
    .select({ model: bikeModels, name: bikeModelTranslations.name })
    .from(bikeModels)
    .leftJoin(
      bikeModelTranslations,
      and(eq(bikeModelTranslations.bikeModelId, bikeModels.id), eq(bikeModelTranslations.locale, 'it'))
    )
    .where(eq(bikeModels.isPublished, true))

  const sizeLinks = await db
    .select({ bikeModelId: bikeModelSizes.bikeModelId, size: bikeSizes })
    .from(bikeModelSizes)
    .innerJoin(bikeSizes, eq(bikeSizes.id, bikeModelSizes.bikeSizeId))

  const versionLinks = await db
    .select({ bikeModelId: bikeModelVersions.bikeModelId, version: bikeVersions })
    .from(bikeModelVersions)
    .innerJoin(bikeVersions, eq(bikeVersions.id, bikeModelVersions.bikeVersionId))

  return models.map(({ model, name }) => ({
    model,
    name: name ?? 'Untitled',
    allowedSizes: sizeLinks.filter((l) => l.bikeModelId === model.id).map((l) => l.size),
    allowedVersions: versionLinks.filter((l) => l.bikeModelId === model.id).map((l) => l.version),
  }))
}

export async function createBikeUnitAction(bikeModelId: string, bikeSizeId: string, bikeVersionId: string) {
  await requireAdmin()

  // Re-checked server-side, not trusted from the client: the size/version
  // must actually be in this model's allowed set, not just any global one.
  const [sizeAllowed] = await db.select().from(bikeModelSizes).where(
    and(eq(bikeModelSizes.bikeModelId, bikeModelId), eq(bikeModelSizes.bikeSizeId, bikeSizeId))
  )
  const [versionAllowed] = await db.select().from(bikeModelVersions).where(
    and(eq(bikeModelVersions.bikeModelId, bikeModelId), eq(bikeModelVersions.bikeVersionId, bikeVersionId))
  )
  if (!sizeAllowed || !versionAllowed) {
    throw new Error('That size or version is not offered by this model')
  }

  await db.insert(bikeUnits).values({ bikeModelId, bikeSizeId, bikeVersionId })
  updateTag('bike-units')
}

export async function deleteBikeUnitAction(id: string) {
  await requireAdmin()
  await db.delete(bikeUnits).where(eq(bikeUnits.id, id))
  updateTag('bike-units')
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/bike-units.ts
git commit -m "Add server actions for shop inventory (bike units)"
```

---

### Task 13: Admin UI — "Il mio negozio" (`/manage/bikes/shop`)

**Files:**
- Create: `components/admin/bike-unit-form.tsx`
- Create: `components/admin/bike-unit-list.tsx`
- Create: `app/manage/bikes/shop/page.tsx`

**Interfaces:**
- Consumes: `getBikeUnitsForAdmin`, `getPublishedModelsWithAllowedOptions`,
  `createBikeUnitAction`, `deleteBikeUnitAction` (Task 12); `shortRouteId`-equivalent
  formatting (`id.slice(0, 8)` inline, no new helper needed — see Global Constraints).

- [ ] **Step 1: `components/admin/bike-unit-form.tsx`**

```tsx
'use client'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { createBikeUnitAction } from '@/lib/actions/bike-units'
import type { BikeModel, BikeSize, BikeVersion } from '@/lib/db'

interface ModelOption {
  model: BikeModel
  name: string
  allowedSizes: BikeSize[]
  allowedVersions: BikeVersion[]
}

export function BikeUnitForm({ models }: { models: ModelOption[] }) {
  const [isPending, startTransition] = useTransition()
  const [modelId, setModelId] = useState('')
  const [sizeId, setSizeId] = useState('')
  const [versionId, setVersionId] = useState('')

  const selected = models.find((m) => m.model.id === modelId)

  function handleModelChange(id: string) {
    setModelId(id)
    setSizeId('')
    setVersionId('')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!modelId || !sizeId || !versionId) return
    startTransition(async () => {
      await createBikeUnitAction(modelId, sizeId, versionId)
      toast.success('Bike added to the shop')
      setModelId('')
      setSizeId('')
      setVersionId('')
    })
  }

  const noOptions = selected && (selected.allowedSizes.length === 0 || selected.allowedVersions.length === 0)

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md p-4 bg-card border rounded-lg">
      <div className="space-y-1">
        <Label htmlFor="unit-model">Model *</Label>
        <Select value={modelId} onValueChange={handleModelChange}>
          <SelectTrigger id="unit-model"><SelectValue placeholder="Choose a model" /></SelectTrigger>
          <SelectContent>
            {models.map((m) => <SelectItem key={m.model.id} value={m.model.id}>{m.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {noOptions && (
        <p className="text-xs text-destructive">
          This model has no sizes or versions configured yet — add them in the model's edit
          page before adding a physical bike.
        </p>
      )}

      {selected && !noOptions && (
        <>
          <div className="space-y-1">
            <Label htmlFor="unit-size">Size *</Label>
            <Select value={sizeId} onValueChange={setSizeId}>
              <SelectTrigger id="unit-size"><SelectValue placeholder="Choose a size" /></SelectTrigger>
              <SelectContent>
                {selected.allowedSizes.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="unit-version">Version *</Label>
            <Select value={versionId} onValueChange={setVersionId}>
              <SelectTrigger id="unit-version"><SelectValue placeholder="Choose a version" /></SelectTrigger>
              <SelectContent>
                {selected.allowedVersions.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      <Button type="submit" disabled={isPending || !modelId || !sizeId || !versionId}>
        Add bike
      </Button>
    </form>
  )
}
```

- [ ] **Step 2: `components/admin/bike-unit-list.tsx`**

```tsx
'use client'
import { useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { deleteBikeUnitAction } from '@/lib/actions/bike-units'
import type { BikeUnit } from '@/lib/db'

interface UnitRow {
  unit: BikeUnit
  modelName: string | null
  sizeName: string
  versionName: string
}

export function BikeUnitList({ units }: { units: UnitRow[] }) {
  const [isPending, startTransition] = useTransition()

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteBikeUnitAction(id)
      toast.success('Bike removed from the shop')
    })
  }

  if (units.length === 0) {
    return <p className="text-muted-foreground text-sm">No bikes in the shop yet.</p>
  }

  return (
    <div className="space-y-2">
      {units.map(({ unit, modelName, sizeName, versionName }) => (
        <div key={unit.id} className="flex items-center justify-between p-3 bg-card border rounded-lg">
          <div className="space-y-0.5">
            <p className="font-mono text-xs text-muted-foreground">{unit.id.slice(0, 8)}</p>
            <p className="text-sm font-medium">{modelName ?? 'Untitled'}</p>
            <p className="text-xs text-muted-foreground">{sizeName} · {versionName}</p>
          </div>
          <Button
            size="icon" variant="ghost" className="text-destructive"
            disabled={isPending}
            onClick={() => handleDelete(unit.id)}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: `app/manage/bikes/shop/page.tsx`**

```tsx
import { getAdminUser } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getBikeUnitsForAdmin, getPublishedModelsWithAllowedOptions } from '@/lib/actions/bike-units'
import { BikeUnitForm } from '@/components/admin/bike-unit-form'
import { BikeUnitList } from '@/components/admin/bike-unit-list'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function BikeShopPage() {
  const user = await getAdminUser()
  if (!user) redirect('/manage/login')

  const [units, models] = await Promise.all([
    getBikeUnitsForAdmin(),
    getPublishedModelsWithAllowedOptions(),
  ])

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-[#1e3a5f]">Il mio negozio</h1>
      <BikeUnitForm models={models} />
      <BikeUnitList units={units} />
    </div>
  )
}
```

- [ ] **Step 4: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: no errors, no new warnings.

- [ ] **Step 5: Manual verification**

With at least one published model that has sizes and versions configured (from Task 11),
add a physical bike: pick the model, confirm the size/version dropdowns only show that
model's allowed options, submit, confirm it appears in the list with a code. Try a model
with no sizes/versions configured and confirm the warning message appears instead of empty
dropdowns. Delete a unit and confirm it disappears.

- [ ] **Step 6: Commit**

```bash
git add components/admin/bike-unit-form.tsx components/admin/bike-unit-list.tsx app/manage/bikes/shop/page.tsx
git commit -m "Add /manage/bikes/shop admin page"
```

---

### Task 14: Sidebar navigation

**Files:**
- Modify: `components/admin/admin-sidebar.tsx`

**Interfaces:**
- Consumes: nothing new — just adds routes to the existing `navItems` array.

- [ ] **Step 1: Add the three nav entries**

Find:

```ts
import { Home, Map, Users, Code2, LogOut } from 'lucide-react'
```

Replace with:

```ts
import { Home, Map, Users, Code2, LogOut, Bike, SlidersHorizontal, Warehouse } from 'lucide-react'
```

Find:

```ts
const navItems = [
  { href: '/manage', label: 'Home', icon: Home, exact: true },
  { href: '/manage/routes', label: 'Routes', icon: Map },
  { href: '/manage/users', label: 'Access', icon: Users },
]
```

Replace with:

```ts
const navItems = [
  { href: '/manage', label: 'Home', icon: Home, exact: true },
  { href: '/manage/routes', label: 'Routes', icon: Map },
  { href: '/manage/bikes', label: 'Bikes', icon: Bike },
  { href: '/manage/bikes/shop', label: 'Il mio negozio', icon: Warehouse },
  { href: '/manage/bike-options', label: 'Bike options', icon: SlidersHorizontal },
  { href: '/manage/users', label: 'Access', icon: Users },
]
```

Note: `/manage/bikes/shop` is listed before `/manage/bike-options` on purpose and both
start with different prefixes (`/manage/bikes` vs `/manage/bike-options`), so the existing
`pathname.startsWith(href)` active-link logic won't cross-highlight them — but
`/manage/bikes/shop` itself starts with `/manage/bikes`, the same prefix as the "Bikes" nav
item above it. Both items will show active at once when on `/manage/bikes/shop`, which is
misleading. Fix this in the same step by giving the "Bikes" entry `exact: true` is wrong
too (it needs to match `/manage/bikes/new` and `/manage/bikes/[id]`, just not
`/manage/bikes/shop`) — instead, check `/manage/bikes/shop` **before** the generic
`/manage/bikes` prefix in the active-link logic. Find the render loop:

```tsx
      <nav className="flex-1 space-y-1">
        {items.map(({ href, label, icon: Icon, exact }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
              (exact ? pathname === href : pathname.startsWith(href))
                ? 'bg-white/15 text-white font-medium'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            )}
          >
```

Replace the highlighted-check line with one that treats `/manage/bikes` as active only when
the path isn't actually under `/manage/bikes/shop`:

```tsx
      <nav className="flex-1 space-y-1">
        {items.map(({ href, label, icon: Icon, exact }) => {
          const isActive = exact
            ? pathname === href
            : href === '/manage/bikes'
              ? pathname.startsWith(href) && !pathname.startsWith('/manage/bikes/shop')
              : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                isActive
                  ? 'bg-white/15 text-white font-medium'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              )}
            >
```

The closing tags for the loop body need `})` instead of the original `))` — adjust the
loop's closing accordingly (it changed from an arrow-expression `.map(() => (...))` to a
block-bodied `.map(() => { ...; return (...) })`).

- [ ] **Step 2: Typecheck, lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors, no new warnings.

- [ ] **Step 3: Manual verification**

Visit each of the five nav links, confirm exactly one is highlighted active at a time —
specifically confirm `/manage/bikes` and `/manage/bikes/shop` are never both highlighted
together.

- [ ] **Step 4: Commit**

```bash
git add components/admin/admin-sidebar.tsx
git commit -m "Add bike admin pages to the sidebar navigation"
```

---

## Self-Review Notes

**Spec coverage:** every section of the design spec has a task — global option lists
(Tasks 1, 6-7), bike model catalog (Tasks 2, 9-11), shop inventory (Tasks 3, 12-13), media
generalization (Task 4), pricing modes (Tasks 1, 5-7). The spec's explicit
out-of-scope list (public page, routes↔bikes linking, booking/Stripe, accessories,
per-unit status) has no task here, correctly.

**Type consistency checked:** `MediaUpload`'s new prop shape (Task 8) matches exactly how
both `route-form.tsx` (Task 8) and `bike-model-form.tsx` (Task 11) call it.
`BikeModelFormState`/`BikeCategoryInput` types are defined once (Tasks 6, 9) and imported,
never redefined. `getBikeModelPresignedUploadUrlAction`'s signature matches what
`MediaUpload` expects.

**Deferred to Task 4's own verification, not re-litigated elsewhere:** every later task that
touches `media` (Tasks 9, 11) assumes Task 4 is already merged and routes are confirmed
still working — that assumption is only safe because Task 4 has its own explicit
live-verification step.
