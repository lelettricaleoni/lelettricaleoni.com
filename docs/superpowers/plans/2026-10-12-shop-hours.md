# Opening hours and closures (part B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the shop's opening hours and closure days are declared in the panel (`/manage/hours`); on the public booking page a closed day cannot be the first or the last day of a stay (a day in the middle may be closed), the server refuses such a stay too, and the customer is told the hours of the pickup day and of the return day.

**Architecture:** two small tables (`shop_opening_hours`, `shop_closures`) read by one module of pure functions (`lib/shop-schedule.ts`) and one uncached loader; the picker (`period-picker.tsx`) already has the `isClosed` slot of the availability engine; `checkStay` gets the same rule for addresses typed by hand. The panel is not limited by the hours (the counter rents when it wants).

**Tech Stack:** Next.js 16 (webpack), Drizzle (`drizzle-kit generate` + `npm run db:migrate`, dev database only), zod 4, `date-fns`, vitest.

**Spec:** `docs/superpowers/specs/2026-10-12-rent-page-day-strip-design.md` (part B). Part A (the picker) is in `docs/superpowers/plans/2026-10-12-rent-page-day-picker.md`.

## Global Constraints

- Days are `YYYY-MM-DD` strings; a weekday is ISO `1..7` (Monday = 1). Times are local Rome `HH:MM` strings (`time` columns, no time zone in the data). A closure stores `ends_on` EXCLUSIVE like everything in the database; the panel form speaks "from / to (last day included)".
- No transaction (`max_pipeline: 0`, `lib/db/no-transactions.test.ts`): replacing the weekly hours is ONE statement (a data-modifying CTE, like `lib/bike-model-sync.ts`); no `sql.raw`, no `.unsafe` (`lib/db/no-raw-sql.test.ts`).
- The panel is in English and never translated; code and comments in English; the public texts in `messages/{it,en,de}.json` (German "du" like the booking pages).
- Every `/manage/<section>` has its own `layout.tsx` with `AdminShell` (`lib/admin-layouts.test.ts`); every admin Server Action refuses a non-admin with `Unauthorized` (`getAdminUser`), and validates its input with zod.
- Migration only on the development database (shared with staging); production is Kevin's decision. The migration enables RLS explicitly and adds no policy. No `apply_migration` (MCP).
- Privacy: shop data only, no person. No cookie, storage or host; `lib/privacy-surface.test.ts` untouched.
- The hours written by hand on the site (home, map, structured data, `docs/contact-details.md`) are NOT replaced: they stay as they are (decision taken in the spec's open question 2: manual for now). The seed of the table is today's value (every day 09:00–13:00 and 14:00–19:00).
- Next.js: no new API is introduced. The schedule is NOT cached (no `"use cache"`, no `updateTag`): it is read on every request of the booking page and of checkout, two tiny queries on pages that are already dynamic, so a change in the panel is seen at once and nothing can serve an old schedule at checkout. Server Actions as in `lib/actions/bike-options.ts` (Next docs `redirect.md` and `use-router.md` were read for the earlier plans; nothing else is needed).

## Review Focus

- A closure in the middle of a stay is allowed; on the first or the last day it is refused (picker and server, `checkStay`).
- A weekday with no range at all is closed.
- Ranges of one day must not overlap or touch badly (09:00–13:00 and 13:00–14:00 are fine; 09:00–14:00 and 13:00–19:00 are not), and each opens before it closes.
- A closure that ends before it starts, or with an invalid date, is refused.
- Saving the weekly hours never leaves the shop with no hours in between (one statement).
- The panel counter rental is not limited by the hours (`createCounterRental` is not touched).
- The customer text for a stay whose first or last day has no hours (a typed address) does not break.

---

### Task 1: The schedule, as pure functions

**Files:**
- Create: `lib/shop-schedule.ts`
- Test: `lib/shop-schedule.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface HoursRange { opensAt: string; closesAt: string }          // 'HH:MM'
  export interface ShopSchedule { weekly: Record<number, HoursRange[]>; closures: { startsOn: IsoDate; endsOn: IsoDate }[] } // endsOn exclusive
  export const EMPTY_SCHEDULE: ShopSchedule
  export function isoWeekday(day: IsoDate): number            // 1..7
  export function isClosedOn(schedule: ShopSchedule, day: IsoDate): boolean
  export function hoursOn(schedule: ShopSchedule, day: IsoDate): HoursRange[]   // [] when closed
  export function closingTimeOn(schedule: ShopSchedule, day: IsoDate): string | null
  export function validateWeek(week: Record<number, HoursRange[]>): string | null   // a reason in English, or null when fine
  ```

- [ ] **Step 1: Write the failing test** `lib/shop-schedule.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { EMPTY_SCHEDULE, closingTimeOn, hoursOn, isClosedOn, isoWeekday, validateWeek, type ShopSchedule } from './shop-schedule'

const DAY = [{ opensAt: '09:00', closesAt: '13:00' }, { opensAt: '14:00', closesAt: '19:00' }]
const week = (overrides: Record<number, { opensAt: string; closesAt: string }[]> = {}) =>
  ({ 1: DAY, 2: DAY, 3: DAY, 4: DAY, 5: DAY, 6: DAY, 7: DAY, ...overrides })
const schedule = (over: Partial<ShopSchedule> = {}): ShopSchedule => ({ weekly: week(), closures: [], ...over })

describe('isoWeekday', () => {
  it('counts Monday as 1 and Sunday as 7', () => {
    expect(isoWeekday('2031-11-03')).toBe(1) // a Monday
    expect(isoWeekday('2031-11-09')).toBe(7) // a Sunday
  })
})

describe('isClosedOn / hoursOn / closingTimeOn', () => {
  it('is open on a day with ranges, and says when it closes', () => {
    expect(isClosedOn(schedule(), '2031-11-03')).toBe(false)
    expect(hoursOn(schedule(), '2031-11-03')).toEqual(DAY)
    expect(closingTimeOn(schedule(), '2031-11-03')).toBe('19:00')
  })
  it('a weekday with no range is closed, and has no closing time', () => {
    const s = schedule({ weekly: week({ 7: [] }) })
    expect(isClosedOn(s, '2031-11-09')).toBe(true)
    expect(hoursOn(s, '2031-11-09')).toEqual([])
    expect(closingTimeOn(s, '2031-11-09')).toBeNull()
  })
  it('a closure covers its first day and its last day included, and not the day it ends (exclusive)', () => {
    const s = schedule({ closures: [{ startsOn: '2031-11-04', endsOn: '2031-11-06' }] })
    expect(isClosedOn(s, '2031-11-03')).toBe(false)
    expect(isClosedOn(s, '2031-11-04')).toBe(true)
    expect(isClosedOn(s, '2031-11-05')).toBe(true)
    expect(isClosedOn(s, '2031-11-06')).toBe(false)
    expect(hoursOn(s, '2031-11-05')).toEqual([])
  })
  it('the closing time is the latest closing of the day, whatever the order of the ranges', () => {
    const s = schedule({ weekly: week({ 1: [{ opensAt: '15:00', closesAt: '20:00' }, { opensAt: '09:00', closesAt: '12:00' }] }) })
    expect(closingTimeOn(s, '2031-11-03')).toBe('20:00')
  })
  it('an empty schedule is closed every day (nothing declared yet)', () => {
    expect(isClosedOn(EMPTY_SCHEDULE, '2031-11-03')).toBe(true)
  })
})

describe('validateWeek', () => {
  it('accepts a normal week, and ranges that touch (13:00 closes, 13:00 opens)', () => {
    expect(validateWeek(week())).toBeNull()
    expect(validateWeek(week({ 2: [{ opensAt: '09:00', closesAt: '13:00' }, { opensAt: '13:00', closesAt: '19:00' }] }))).toBeNull()
  })
  it('refuses a range that closes before or when it opens', () => {
    expect(validateWeek(week({ 2: [{ opensAt: '13:00', closesAt: '09:00' }] }))).toMatch(/before it closes/)
    expect(validateWeek(week({ 2: [{ opensAt: '09:00', closesAt: '09:00' }] }))).toMatch(/before it closes/)
  })
  it('refuses ranges of one day that overlap, in any order', () => {
    expect(validateWeek(week({ 3: [{ opensAt: '09:00', closesAt: '14:00' }, { opensAt: '13:00', closesAt: '19:00' }] }))).toMatch(/overlap/)
    expect(validateWeek(week({ 3: [{ opensAt: '13:00', closesAt: '19:00' }, { opensAt: '09:00', closesAt: '14:00' }] }))).toMatch(/overlap/)
  })
})
```

- [ ] **Step 2: Run it and see it fail** — `npx vitest run lib/shop-schedule.test.ts` (FAIL: cannot resolve `./shop-schedule`).

- [ ] **Step 3: Write `lib/shop-schedule.ts`**

```ts
import { getISODay } from 'date-fns'
import { dayToDate, type IsoDate } from '@/lib/dates'

/*
 * When the shop is open, as plain functions over a schedule read from the database (`lib/shop-schedule-data.ts`). Times are the clock of
 * Rome as 'HH:MM' strings (no time zone in the data: the shop is in one place), weekdays are ISO (Monday 1 … Sunday 7). A closure is a period
 * of days with the end EXCLUSIVE, like every period in the database.
 */

export interface HoursRange { opensAt: string; closesAt: string }

export interface ShopSchedule {
  /** The ranges of each ISO weekday; a weekday with none is closed. */
  weekly: Record<number, HoursRange[]>
  closures: { startsOn: IsoDate; endsOn: IsoDate }[]
}

/** Nothing declared: closed every day. */
export const EMPTY_SCHEDULE: ShopSchedule = { weekly: {}, closures: [] }

export function isoWeekday(day: IsoDate): number {
  return getISODay(dayToDate(day))
}

const byOpening = (a: HoursRange, b: HoursRange) => a.opensAt.localeCompare(b.opensAt)

/** The ranges of a day, in order; none when it is closed (no ranges that weekday, or inside a closure). */
export function hoursOn(schedule: ShopSchedule, day: IsoDate): HoursRange[] {
  if (schedule.closures.some((closure) => closure.startsOn <= day && day < closure.endsOn)) return []
  return [...(schedule.weekly[isoWeekday(day)] ?? [])].sort(byOpening)
}

export const isClosedOn = (schedule: ShopSchedule, day: IsoDate) => hoursOn(schedule, day).length === 0

/** The last closing of the day ("by the end of the first day"), or null when the shop is closed. */
export function closingTimeOn(schedule: ShopSchedule, day: IsoDate): string | null {
  const ranges = hoursOn(schedule, day)
  return ranges.length === 0 ? null : ranges.map((range) => range.closesAt).sort().at(-1)!
}

/** Why a week of ranges cannot be saved, in words for the panel, or null when it is fine. Ranges may touch (closes 13:00, opens 13:00). */
export function validateWeek(week: Record<number, HoursRange[]>): string | null {
  for (const [weekday, ranges] of Object.entries(week)) {
    for (const range of ranges) {
      if (range.opensAt >= range.closesAt) return `Day ${weekday}: a range must open before it closes`
    }
    const sorted = [...ranges].sort(byOpening)
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].opensAt < sorted[i - 1].closesAt) return `Day ${weekday}: two ranges overlap`
    }
  }
  return null
}
```

- [ ] **Step 4: Run it and see it pass** — `npx vitest run lib/shop-schedule.test.ts` (PASS).
- [ ] **Step 5: Commit** — `git add lib/shop-schedule.ts lib/shop-schedule.test.ts && git commit -m "Shop hours: the schedule as pure functions"`

---

### Task 2: Tables, migration, and the read/write module

**Files:**
- Modify: `lib/db/schema.ts` (two tables), `lib/db/migrations/0025_*.sql` (+ `meta/`, generated)
- Create: `lib/shop-schedule-data.ts`
- Test: `tests/db/shop-schedule.test.ts`

**Interfaces:**
- Consumes: Task 1 types.
- Produces:
  ```ts
  export async function loadShopSchedule(): Promise<ShopSchedule>
  export async function saveWeeklyHours(week: Record<number, HoursRange[]>): Promise<void>   // ONE statement
  export async function addClosure(input: { startsOn: IsoDate; lastDay: IsoDate; reason: string | null }): Promise<void>
  export async function removeClosure(id: string): Promise<void>
  export async function listClosures(): Promise<{ id: string; startsOn: IsoDate; lastDay: IsoDate; reason: string | null }[]>   // upcoming and current, in order
  ```

- [ ] **Step 1:** add to `lib/db/schema.ts`
  ```ts
  // One row per range of opening time: more rows in the same weekday are the break. A weekday with no row is closed. Local Rome time (no zone).
  export const shopOpeningHours = pgTable('shop_opening_hours', {
    id:       uuid('id').primaryKey().defaultRandom(),
    weekday:  smallint('weekday').notNull(),   // ISO 1..7; CHECK in the migration
    opensAt:  time('opens_at').notNull(),
    closesAt: time('closes_at').notNull(),
  })
  // Days the shop is closed: starts_on included, ends_on EXCLUDED (like every period). `reason` is for the staff only.
  export const shopClosures = pgTable('shop_closures', {
    id:       uuid('id').primaryKey().defaultRandom(),
    startsOn: date('starts_on', { mode: 'string' }).notNull(),
    endsOn:   date('ends_on', { mode: 'string' }).notNull(),
    reason:   text('reason'),
  })
  ```
  (import `smallint`, `time` from `drizzle-orm/pg-core`.)
- [ ] **Step 2:** `npx drizzle-kit generate`, then edit the new `0025_*.sql` to add, after the `CREATE TABLE`s: `CHECK (weekday BETWEEN 1 AND 7)`, `CHECK (opens_at < closes_at)`, `CHECK (ends_on > starts_on)`, `ENABLE ROW LEVEL SECURITY` for both (explicit, as `0024`), and the seed: every weekday 1..7 with `('09:00','13:00')` and `('14:00','19:00')`.
- [ ] **Step 3:** write the test `tests/db/shop-schedule.test.ts` (it restores what it changes: it reads the weekly rows and closures before, and puts them back in `afterEach`, because staging shares this database): the seed is read back as every day with two ranges; `saveWeeklyHours` replaces the week (a day with `[]` ends up closed), is idempotent, and a failing input (`opensAt >= closesAt`) is refused by the CHECK and leaves the old week intact (one statement); `addClosure` stores the last day as the exclusive end, `listClosures` returns the last day included, hides closures already over, and `removeClosure` removes one; `loadShopSchedule` feeds `isClosedOn` correctly for a closure and for a closed weekday.
- [ ] **Step 4:** write `lib/shop-schedule-data.ts` (times from Postgres come as `HH:MM:SS`: cut to `HH:MM`); `saveWeeklyHours` is one CTE: `WITH removed AS (DELETE FROM shop_opening_hours RETURNING 1) INSERT INTO shop_opening_hours (weekday, opens_at, closes_at) SELECT … FROM unnest(${weekdays}::smallint[], ${opens}::time[], ${closes}::time[])` with the arrays bound as parameters (no `sql.raw`).
- [ ] **Step 5:** `npm run db:migrate`, `npm run test:db -- tests/db/shop-schedule.test.ts` (PASS), `npx tsc --noEmit`, `npx vitest run lib/db`.
- [ ] **Step 6: Commit** — `git add lib/db lib/shop-schedule-data.ts tests/db/shop-schedule.test.ts && git commit -m "Shop hours: tables, migration 0025 and the module that reads and writes them"`

---

### Task 3: The panel page `/manage/hours`

**Files:**
- Create: `lib/actions/shop-hours.ts`, `lib/actions/shop-hours.test.ts`, `app/manage/hours/layout.tsx`, `app/manage/hours/page.tsx`, `components/admin/shop-hours-editor.tsx`
- Modify: `components/admin/admin-sidebar.tsx` (entry "Opening hours", icon `LuClock`), `components/admin/admin-sidebar.test.ts` if it lists the entries

**Interfaces:**
- Produces Server Actions: `saveOpeningHoursAction(input: unknown): Promise<{ status: 'saved' } | { status: 'invalid'; message: string }>`, `addClosureAction(input: unknown): Promise<{ status: 'added' } | { status: 'invalid'; message: string }>`, `removeClosureAction(id: unknown): Promise<{ status: 'removed' | 'invalid' }>`; all refuse a non-admin with `Unauthorized` before anything else.

- [ ] **Step 1:** write `lib/actions/shop-hours.test.ts` (mock `@/lib/supabase/server` `getAdminUser` and `@/lib/shop-schedule-data`, like `lib/actions/reservations.test.ts`): each action throws `Unauthorized` for a non-admin and never reaches the data module; bad input (`'9:00'`, `'09:00'` to `'08:00'`, overlapping ranges, a weekday outside 1..7, a closure that ends before it starts or with an impossible date, a reason longer than 200) answers `invalid` and writes nothing; good input is written once with the right shape (the closure's last day is passed as given: the module makes it exclusive).
- [ ] **Step 2:** write the actions with `zod` (`z.iso.time({ precision: -1 })` for `HH:MM`, `z.iso.date()` for days, `validateWeek` for the ranges) and `getAdminUser` as `lib/actions/bike-options.ts` does.
- [ ] **Step 3:** layout with `AdminShell` (as `app/manage/bookings/layout.tsx`), page (admin check + `redirect('/manage/login')` as the others, `loadShopSchedule` + `listClosures`), and the client editor: seven rows (weekday name, a "Closed" `Switch`, the ranges as two `<Input type="time">` with a remove button, "Add range"), "Save hours" (the one filled button of that card), and a second card "Closures" with the list (from – to, reason, "Remove") and a small form "Add closure" (from, to, reason). Toasts for results (`sonner`, the shell has the `Toaster`). Admin look: the panel's navy headings like the other pages.
- [ ] **Step 4:** run `npx vitest run lib/actions lib/admin-layouts.test.ts components/admin` and `npx tsc --noEmit && npx eslint components/admin app/manage lib/actions`.
- [ ] **Step 5: Commit** — `git commit -m "Shop hours: the panel page"`

---

### Task 4: Closed days on the booking page and in checkout

**Files:**
- Modify: `lib/booking/rules.ts` (`checkStay` gets an optional `isClosed`), `lib/booking/rules.test.ts`, `lib/booking/checkout.ts`, `lib/booking/rent-actions.ts` (pass the schedule), `app/[lang]/rent/page.tsx`, `components/rent/rent-flow.tsx`, `components/rent/period-picker.tsx`, `lib/booking/format.ts` (+ test), `messages/*.json`, `app/[lang]/account/rents/[id]/page.tsx`

**Interfaces:**
- Consumes: `isClosedOn`, `hoursOn`, `closingTimeOn`, `loadShopSchedule`.
- `checkStay(startsOn, endsOn, today, options?: { isClosed?: (day: IsoDate) => boolean })` adds the reason `'closed_day'`; `BeginCheckoutInput` gets `schedule: ShopSchedule` (the server reads it with `loadShopSchedule()` in `startCheckoutForUser`); `beginCheckout` answers `{ status: 'invalid', reason: 'closed_day' }`.

- [ ] **Step 1: tests first.** `rules.test.ts`: a stay whose first day is closed, whose last day is closed → `{ ok: false, reason: 'closed_day' }`; a closed day in the middle → ok; no `isClosed` → as today. `tests/db/checkout.test.ts` (or `rent-actions.test.ts`): a stay starting on a closed weekday/closure is refused with `invalid / closed_day` and holds nothing. `format.test.ts`: `formatHours([{opensAt:'09:00',closesAt:'13:00'},{opensAt:'14:00',closesAt:'19:00'}], 'it')` → `09:00–13:00 e 14:00–19:00` (en `and`, de `und`).
- [ ] **Step 2: code.** `checkStay` checks the first and the last day after the date checks; `formatHours` in `lib/booking/format.ts` (a library for the list join: `Intl.ListFormat`, with the time ranges joined by an en dash); the page loads the schedule once and gives the picker a plain object, the picker's `isClosed = (day) => isClosedOn(schedule, day)` with the reason text `off_closed` ("{day}, il negozio è chiuso"); `legend_off_days` / `legend_off_bike` say "chiuso o…".
- [ ] **Step 3: texts for the customer.** With a stay chosen, the summary and "Le tue prenotazioni" (booking page) say the hours of the pickup day and of the return day (`rent.pickup_when`, `account.rents.pickup_when`: «Ritiro {pickupDay}, orari {pickupHours}. Riconsegna {returnDay}, orari {returnHours}. Entro la chiusura: le bici vanno ricaricate e non si riconsegnano il giorno dopo. Per accordi diversi, chiamaci.»), and the generic `pickup_note` when there is no stay (and when a day has no hours). en and de written with it, same step.
- [ ] **Step 4:** `npx vitest run && npm run test:db && npx tsc --noEmit && npx eslint .`
- [ ] **Step 5: Commit** — `git commit -m "Shop hours: closed days cannot start or end a stay, and the customer is told the hours"`

---

### Task 5: Try it, document, publish

- [ ] **Step 1:** dev server on this worktree; in the panel save different hours and a closure, then on `/it/rent` a closed day is grey as first and last day and not in the middle; an address typed by hand with a closed first day is refused with the message; the pickup text shows the day and the hours; at 320, 375 and 1440 px, it, en, de. Put back the real hours and delete the test closure afterwards (the database is shared with staging).
- [ ] **Step 2:** `docs/ai/ROADMAP.md` (part B done on staging; the hours of the site still manual; the Google Business Profile copy is Kevin's), `docs/contact-details.md` (one line: the table now exists and the pages do not read it yet), `docs/ai/STATE.md` only if a trap was found.
- [ ] **Step 3:** `git status`, PR to `staging` with the privacy questions, background merge guard.
