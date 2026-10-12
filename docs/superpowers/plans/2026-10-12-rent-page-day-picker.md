# Rent page with the day picker (part A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/rent` gets a period picker (month grid that folds into a one-line "‹ day before / day after ›" bar), a card per bike model, and two ways in: by days (`/rent`) and by bike (`/rent?model=<uuid>`), and the pickup text says what the shop actually means (pick up by the end of the first day, return by the end of the last).

**Architecture:** a pure availability engine (`lib/booking/day-availability.ts`) and a pure selection state (`lib/booking/period-selection.ts`) run in the browser over the busy periods of every physical bike, which the page reads from the database on each request (`lib/booking/busy-intervals.ts`). The server still checks everything again when the person pays (`beginCheckout`): the picker guides, it does not decide. The month grid is shadcn's `Calendar` (react-day-picker 10).

**Tech Stack:** Next.js 16.3.8 (webpack), React 19, Tailwind 4, shadcn `Calendar`, `date-fns` through `lib/dates.ts`, Drizzle, vitest (unit) and `npm run test:db` (dev database).

**Spec:** `docs/superpowers/specs/2026-10-12-rent-page-day-strip-design.md` (part A only; part B, the opening hours, is another plan).

## Global Constraints

- Days are `YYYY-MM-DD` strings (`IsoDate`), never `Date`, except at the edge of react-day-picker (`dayToDate` / `isoDay` in `lib/dates.ts`). A stay is `DayRange { startsOn, endsOn }` with `endsOn` **exclusive**; the address (`from`, `to`) and the picker show the last day **included**.
- "A bike is taken" has one definition: `OCCUPYING_STATUSES` in `lib/booking/occupancy.ts` (`confirmed`, `held`). Online booking opens tomorrow (`minDay = today + 1`) up to `MAX_DAYS_AHEAD = 180` days.
- Design: `design-system` skill. `rounded-md` for controls, `primary` blue for the chosen period, no pill for an action, `react-icons/lu`, no new hex values, one filled button per view. Nothing moves unless a gesture asks for it (`transition-colors` only).
- Public site is it/en/de (`messages/*.json`); code, comments and the admin panel are in English. No infrastructure detail in user-facing text.
- Privacy: no new data, cookie, storage or external service; `lib/privacy-surface.test.ts` must stay green untouched.
- Next docs read before writing: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md` (`router.push(href, { scroll: false })`, already used by `RentFlow`). The page keeps `export const instant = false` and `await connection()` as today; no new Next API is introduced.
- No DOM test tooling in the project (no jsdom, no testing library) and none is added: behaviour lives in pure functions with unit tests, and the rendered component is checked in a real browser (Task 6).
- Never `npm install` inside the worktree (`node_modules` is a junction to the main repository).

## Review Focus

- A bike retired in the middle of the window: days from `retired_on` on are not free for it (Task 1).
- One bike free Mon–Tue and another Wed–Thu: Mon–Thu must **not** be selectable as one stay in the by-bike mode (Task 1).
- Two reservations that touch (one ends the day the next starts) are one busy period (Task 1).
- Picking the end before the start, or the same day twice (Task 2).
- Shifting the period by one day into a place that is not bookable must be refused, not clamped (Task 2).
- A link with `model=<uuid>` of an unpublished or unknown model must fall back to the by-days mode, not break (Task 3).
- A model with no bike free in the period stays on the page, switched off, and cannot be added to the cart (Tasks 3 and 5).
- An old link with a cart in the address and a period that is no longer free: the cart is cleaned by `sanitizeCart` as today (Task 6).

---

### Task 1: The availability engine

**Files:**
- Create: `lib/booking/day-availability.ts`
- Test: `lib/booking/day-availability.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface UnitBusy { unitId: string; modelId: string; sizeId: string; versionId: string; retiredOn: IsoDate | null; busy: DayRange[] }
  export function mergeRanges(ranges: DayRange[]): DayRange[]
  export function isFreeOn(unit: UnitBusy, day: IsoDate): boolean
  export function freeUnits(units: UnitBusy[], day: IsoDate): UnitBusy[]
  export function dayHasBike(units: UnitBusy[], day: IsoDate): boolean
  export function freeForRange(units: UnitBusy[], range: DayRange): UnitBusy[]
  export function lastSelectableDay(units: UnitBusy[], start: IsoDate, maxDays: number): IsoDate | null
  export type DayReason = 'past' | 'too_far' | 'closed' | 'no_bike' | 'beyond_end'
  export type DayCheck = { ok: true } | { ok: false; reason: DayReason }
  export interface PickContext { units: UnitBusy[]; minDay: IsoDate; maxDay: IsoDate; start: IsoDate | null; maxDays: number | null; isClosed?: (day: IsoDate) => boolean }
  export function isSelectable(day: IsoDate, ctx: PickContext): DayCheck
  ```
  (`isClosed` is for part B; part A never passes it.)

- [ ] **Step 1: Write the failing test** `lib/booking/day-availability.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import {
  dayHasBike, freeForRange, freeUnits, isSelectable, lastSelectableDay, mergeRanges, type PickContext, type UnitBusy,
} from './day-availability'

// Mon 2031-11-03 … Sun 2031-11-09
const unit = (id: string, busy: [string, string][] = [], retiredOn: string | null = null): UnitBusy => ({
  unitId: id, modelId: 'm', sizeId: 's', versionId: 'v', retiredOn, busy: busy.map(([startsOn, endsOn]) => ({ startsOn, endsOn })),
})
// A is free Mon–Tue (busy from Wed), B is free Wed–Thu (busy before Wed, and from Fri).
const A = unit('A', [['2031-11-05', '2031-12-01']])
const B = unit('B', [['2031-11-01', '2031-11-05'], ['2031-11-07', '2031-12-01']])

describe('mergeRanges', () => {
  it('merges overlapping and touching periods and keeps the others apart', () => {
    expect(mergeRanges([
      { startsOn: '2031-11-10', endsOn: '2031-11-12' },
      { startsOn: '2031-11-03', endsOn: '2031-11-05' },
      { startsOn: '2031-11-05', endsOn: '2031-11-06' },
      { startsOn: '2031-11-04', endsOn: '2031-11-05' },
    ])).toEqual([
      { startsOn: '2031-11-03', endsOn: '2031-11-06' },
      { startsOn: '2031-11-10', endsOn: '2031-11-12' },
    ])
  })
  it('is empty for nothing', () => expect(mergeRanges([])).toEqual([]))
})

describe('freeUnits / dayHasBike', () => {
  it('the end of a busy period is exclusive: the bike is free that day', () => {
    expect(freeUnits([B], '2031-11-04')).toHaveLength(0)
    expect(freeUnits([B], '2031-11-05')).toHaveLength(1)
    expect(freeUnits([B], '2031-11-06')).toHaveLength(1)
    expect(freeUnits([B], '2031-11-07')).toHaveLength(0)
  })
  it('a bike retired on a day is not free that day nor after, but is the day before', () => {
    const retired = unit('R', [], '2031-11-05')
    expect(dayHasBike([retired], '2031-11-04')).toBe(true)
    expect(dayHasBike([retired], '2031-11-05')).toBe(false)
    expect(dayHasBike([retired], '2031-11-20')).toBe(false)
  })
  it('a day has a bike when one of several is free', () => {
    expect(dayHasBike([A, B], '2031-11-03')).toBe(true)
    expect(dayHasBike([A, B], '2031-11-05')).toBe(true)
    expect(dayHasBike([A, B], '2031-11-08')).toBe(false)
  })
})

describe('freeForRange', () => {
  it('keeps the bikes free for every day of the stay, with the end exclusive', () => {
    expect(freeForRange([A, B], { startsOn: '2031-11-03', endsOn: '2031-11-05' }).map((u) => u.unitId)).toEqual(['A'])
    expect(freeForRange([A, B], { startsOn: '2031-11-05', endsOn: '2031-11-07' }).map((u) => u.unitId)).toEqual(['B'])
    expect(freeForRange([A, B], { startsOn: '2031-11-03', endsOn: '2031-11-07' })).toEqual([])
  })
  it('refuses a bike retired before the last day of the stay', () => {
    const retired = unit('R', [], '2031-11-05')
    expect(freeForRange([retired], { startsOn: '2031-11-03', endsOn: '2031-11-05' })).toHaveLength(1)
    expect(freeForRange([retired], { startsOn: '2031-11-03', endsOn: '2031-11-06' })).toHaveLength(0)
  })
})

describe('lastSelectableDay', () => {
  it('is the furthest day one bike can cover from the start (Kevin: Mon–Tue on A, Wed–Thu on B)', () => {
    expect(lastSelectableDay([A, B], '2031-11-03', 7)).toBe('2031-11-04')
    expect(lastSelectableDay([A, B], '2031-11-05', 7)).toBe('2031-11-06')
  })
  it('stops at the maximum days of the category', () => {
    expect(lastSelectableDay([unit('free')], '2031-11-03', 3)).toBe('2031-11-05')
    expect(lastSelectableDay([unit('free')], '2031-11-03', 1)).toBe('2031-11-03')
  })
  it('stops the day before the bike is retired', () => {
    expect(lastSelectableDay([unit('R', [], '2031-11-06')], '2031-11-03', 7)).toBe('2031-11-05')
  })
  it('takes the bike that goes furthest', () => {
    const long = unit('L', [['2031-11-09', '2031-12-01']])
    expect(lastSelectableDay([A, long], '2031-11-03', 7)).toBe('2031-11-08')
  })
  it('is null when no bike is free that day', () => {
    expect(lastSelectableDay([A, B], '2031-11-08', 7)).toBeNull()
  })
})

describe('isSelectable', () => {
  const base: PickContext = { units: [A, B], minDay: '2031-11-03', maxDay: '2031-11-20', start: null, maxDays: null }
  it('says why a day is off, in this order: past, too far, closed, no bike', () => {
    expect(isSelectable('2031-11-02', base)).toEqual({ ok: false, reason: 'past' })
    expect(isSelectable('2031-11-21', base)).toEqual({ ok: false, reason: 'too_far' })
    expect(isSelectable('2031-11-10', { ...base, isClosed: () => true })).toEqual({ ok: false, reason: 'closed' })
    expect(isSelectable('2031-11-08', base)).toEqual({ ok: false, reason: 'no_bike' })
    expect(isSelectable('2031-11-03', base)).toEqual({ ok: true })
  })
  it('with a start and a limit in days, a day past what one bike covers is off, even if some bike is free that day', () => {
    const ctx = { ...base, start: '2031-11-03', maxDays: 7 }
    expect(isSelectable('2031-11-04', ctx)).toEqual({ ok: true })
    expect(isSelectable('2031-11-05', ctx)).toEqual({ ok: false, reason: 'beyond_end' })
    expect(isSelectable('2031-11-06', ctx)).toEqual({ ok: false, reason: 'beyond_end' })
  })
  it('a day before the start is always a valid new start, never beyond_end', () => {
    expect(isSelectable('2031-11-03', { ...base, start: '2031-11-05', maxDays: 7 })).toEqual({ ok: true })
  })
  it('without a limit in days (by days) nothing is beyond_end', () => {
    expect(isSelectable('2031-11-06', { ...base, start: '2031-11-03', maxDays: null })).toEqual({ ok: true })
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run lib/booking/day-availability.test.ts`
Expected: FAIL, "Failed to resolve import './day-availability'".

- [ ] **Step 3: Write `lib/booking/day-availability.ts`**

```ts
import { addDaysTo, type DayRange, type IsoDate } from '@/lib/dates'

/*
 * Which days a bike can be rented, as plain functions over the busy periods of every physical bike. It runs in the browser (the picker
 * greys out days without waiting for the server) and in tests; it decides nothing that matters: `beginCheckout` checks the stay again
 * when the person pays. "Taken" means what `OCCUPYING_STATUSES` says (lib/booking/occupancy.ts): the periods given here are already those.
 * Days are `YYYY-MM-DD` strings, so `<` and `>` on them are calendar order.
 */

export interface UnitBusy {
  unitId: string
  modelId: string
  sizeId: string
  versionId: string
  /** The first day the bike is no longer offered, or null while it is in service. */
  retiredOn: IsoDate | null
  /** The periods it is taken (the end is exclusive), already merged and in order. */
  busy: DayRange[]
}

/** Periods that overlap or touch become one; the result is in order. */
export function mergeRanges(ranges: DayRange[]): DayRange[] {
  const sorted = [...ranges].sort((a, b) => a.startsOn.localeCompare(b.startsOn))
  const merged: DayRange[] = []
  for (const range of sorted) {
    const last = merged[merged.length - 1]
    if (last && range.startsOn <= last.endsOn) {
      if (range.endsOn > last.endsOn) last.endsOn = range.endsOn
    } else {
      merged.push({ ...range })
    }
  }
  return merged
}

export function isFreeOn(unit: UnitBusy, day: IsoDate): boolean {
  if (unit.retiredOn !== null && day >= unit.retiredOn) return false
  return !unit.busy.some((period) => period.startsOn <= day && day < period.endsOn)
}

export const freeUnits = (units: UnitBusy[], day: IsoDate) => units.filter((unit) => isFreeOn(unit, day))

export const dayHasBike = (units: UnitBusy[], day: IsoDate) => units.some((unit) => isFreeOn(unit, day))

/** The bikes free for every day of `range` (end exclusive): the same rule as `getFreeBikes`, which the server uses. */
export function freeForRange(units: UnitBusy[], range: DayRange): UnitBusy[] {
  return units.filter(
    (unit) =>
      (unit.retiredOn === null || range.endsOn <= unit.retiredOn) &&
      !unit.busy.some((period) => period.startsOn < range.endsOn && range.startsOn < period.endsOn),
  )
}

/**
 * The furthest last day a stay starting on `start` can have with ONE bike: the largest, over the bikes free that day, of the day before
 * its next busy period or its retirement, never more than `maxDays` days in all. Null when no bike is free on `start`.
 */
export function lastSelectableDay(units: UnitBusy[], start: IsoDate, maxDays: number): IsoDate | null {
  let best: IsoDate | null = null
  for (const unit of freeUnits(units, start)) {
    let limit = addDaysTo(start, maxDays - 1)
    const next = unit.busy.find((period) => period.startsOn > start)
    if (next) limit = minDay(limit, addDaysTo(next.startsOn, -1))
    if (unit.retiredOn !== null) limit = minDay(limit, addDaysTo(unit.retiredOn, -1))
    if (best === null || limit > best) best = limit
  }
  return best
}

const minDay = (a: IsoDate, b: IsoDate) => (a < b ? a : b)

export type DayReason = 'past' | 'too_far' | 'closed' | 'no_bike' | 'beyond_end'
export type DayCheck = { ok: true } | { ok: false; reason: DayReason }

export interface PickContext {
  units: UnitBusy[]
  minDay: IsoDate
  maxDay: IsoDate
  /** The first day already chosen (the person is picking the last), or null. */
  start: IsoDate | null
  /** The category's limit in days when one bike is being booked; null by days, where each model says it later. */
  maxDays: number | null
  /** The shop is closed that day (part B). A closed day cannot be the first or the last, but a stay may go through it. */
  isClosed?: (day: IsoDate) => boolean
}

export function isSelectable(day: IsoDate, ctx: PickContext): DayCheck {
  if (day < ctx.minDay) return { ok: false, reason: 'past' }
  if (day > ctx.maxDay) return { ok: false, reason: 'too_far' }
  if (ctx.isClosed?.(day)) return { ok: false, reason: 'closed' }
  if (!dayHasBike(ctx.units, day)) return { ok: false, reason: 'no_bike' }
  if (ctx.start !== null && ctx.maxDays !== null && day > ctx.start) {
    const last = lastSelectableDay(ctx.units, ctx.start, ctx.maxDays)
    if (last === null || day > last) return { ok: false, reason: 'beyond_end' }
  }
  return { ok: true }
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `npx vitest run lib/booking/day-availability.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/booking/day-availability.ts lib/booking/day-availability.test.ts
git commit -m "Rent: a pure availability engine for the day picker"
```

---

### Task 2: The selection state

**Files:**
- Create: `lib/booking/period-selection.ts`
- Test: `lib/booking/period-selection.test.ts`

**Interfaces:**
- Consumes: Task 1 (`PickContext`, `isSelectable`, `freeForRange`).
- Produces:
  ```ts
  export interface Selection { start: IsoDate | null; end: IsoDate | null }   // both days included
  export const EMPTY_SELECTION: Selection
  export function pickDay(selection: Selection, day: IsoDate): Selection
  export function selectionToRange(selection: Selection): DayRange | null
  export function rangeToSelection(range: DayRange | null): Selection
  export function shiftRange(range: DayRange, by: number): DayRange
  export function canBook(range: DayRange, ctx: Omit<PickContext, 'start'>): boolean
  ```

- [ ] **Step 1: Write the failing test** `lib/booking/period-selection.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import type { PickContext, UnitBusy } from './day-availability'
import { EMPTY_SELECTION, canBook, pickDay, rangeToSelection, selectionToRange, shiftRange } from './period-selection'

describe('pickDay', () => {
  it('the first tap starts, the second ends', () => {
    const one = pickDay(EMPTY_SELECTION, '2031-11-03')
    expect(one).toEqual({ start: '2031-11-03', end: null })
    expect(pickDay(one, '2031-11-05')).toEqual({ start: '2031-11-03', end: '2031-11-05' })
  })
  it('the same day twice is a stay of one day', () => {
    const one = pickDay(EMPTY_SELECTION, '2031-11-03')
    expect(selectionToRange(pickDay(one, '2031-11-03'))).toEqual({ startsOn: '2031-11-03', endsOn: '2031-11-04' })
  })
  it('a tap before the start starts again from there', () => {
    const one = pickDay(EMPTY_SELECTION, '2031-11-05')
    expect(pickDay(one, '2031-11-03')).toEqual({ start: '2031-11-03', end: null })
  })
  it('a tap on a finished period starts a new one', () => {
    expect(pickDay({ start: '2031-11-03', end: '2031-11-05' }, '2031-11-10')).toEqual({ start: '2031-11-10', end: null })
  })
})

describe('selection and range', () => {
  it('has no range until both days are there', () => {
    expect(selectionToRange({ start: '2031-11-03', end: null })).toBeNull()
    expect(selectionToRange(EMPTY_SELECTION)).toBeNull()
  })
  it('round-trips a stay: the last day is included in the selection, excluded in the range', () => {
    const range = { startsOn: '2031-11-03', endsOn: '2031-11-06' }
    expect(rangeToSelection(range)).toEqual({ start: '2031-11-03', end: '2031-11-05' })
    expect(selectionToRange(rangeToSelection(range))).toEqual(range)
    expect(rangeToSelection(null)).toEqual(EMPTY_SELECTION)
  })
})

describe('shiftRange', () => {
  it('moves the whole stay, keeping its length', () => {
    expect(shiftRange({ startsOn: '2031-11-03', endsOn: '2031-11-06' }, 1)).toEqual({ startsOn: '2031-11-04', endsOn: '2031-11-07' })
    expect(shiftRange({ startsOn: '2031-11-03', endsOn: '2031-11-06' }, -1)).toEqual({ startsOn: '2031-11-02', endsOn: '2031-11-05' })
    expect(shiftRange({ startsOn: '2031-10-30', endsOn: '2031-11-02' }, 3)).toEqual({ startsOn: '2031-11-02', endsOn: '2031-11-05' })
  })
})

describe('canBook', () => {
  const unit = (id: string, busy: [string, string][] = [], retiredOn: string | null = null): UnitBusy => ({
    unitId: id, modelId: 'm', sizeId: 's', versionId: 'v', retiredOn, busy: busy.map(([startsOn, endsOn]) => ({ startsOn, endsOn })),
  })
  const ctx = (units: UnitBusy[], maxDays: number | null = null): Omit<PickContext, 'start'> =>
    ({ units, minDay: '2031-11-03', maxDay: '2031-11-20', maxDays })
  const stay = (a: string, b: string) => ({ startsOn: a, endsOn: b })

  it('is true when a bike is free for the whole stay', () => {
    expect(canBook(stay('2031-11-04', '2031-11-07'), ctx([unit('A')]))).toBe(true)
  })
  it('is false when no single bike covers it, even if every day has some bike', () => {
    const units = [unit('A', [['2031-11-05', '2031-12-01']]), unit('B', [['2031-11-01', '2031-11-05']])]
    expect(canBook(stay('2031-11-03', '2031-11-07'), ctx(units))).toBe(false)
  })
  it('is false before the first sellable day and past the last', () => {
    expect(canBook(stay('2031-11-02', '2031-11-04'), ctx([unit('A')]))).toBe(false)
    expect(canBook(stay('2031-11-20', '2031-11-22'), ctx([unit('A')]))).toBe(false)
  })
  it('is false past the days the category allows', () => {
    expect(canBook(stay('2031-11-04', '2031-11-08'), ctx([unit('A')], 3))).toBe(false)
    expect(canBook(stay('2031-11-04', '2031-11-07'), ctx([unit('A')], 3))).toBe(true)
  })
  it('does not look at a closed day in the middle, only at the two ends', () => {
    const closedMiddle = { ...ctx([unit('A')]), isClosed: (day: string) => day === '2031-11-05' }
    expect(canBook(stay('2031-11-04', '2031-11-07'), closedMiddle)).toBe(true)
    expect(canBook(stay('2031-11-05', '2031-11-07'), closedMiddle)).toBe(false)
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run lib/booking/period-selection.test.ts`
Expected: FAIL, "Failed to resolve import './period-selection'".

- [ ] **Step 3: Write `lib/booking/period-selection.ts`**

```ts
import { addDaysTo, exclusiveEnd, inclusiveEnd, type DayRange, type IsoDate } from '@/lib/dates'
import { freeForRange, isSelectable, type PickContext } from './day-availability'

/*
 * What the picker keeps while a person chooses the days: the first and the last day, both included (as people say them). The stay the
 * rest of the page and the database use is a `DayRange` with the end exclusive; the two are converted here and nowhere else.
 */

export interface Selection { start: IsoDate | null; end: IsoDate | null }

export const EMPTY_SELECTION: Selection = { start: null, end: null }

/**
 * One tap on a day. Nothing chosen, or a finished period: it starts a new one. A first day only: a day before it starts again from there,
 * the same day or a later one closes the period (the same day twice is a stay of one day).
 */
export function pickDay(selection: Selection, day: IsoDate): Selection {
  if (selection.start === null || selection.end !== null) return { start: day, end: null }
  if (day < selection.start) return { start: day, end: null }
  return { start: selection.start, end: day }
}

export function selectionToRange(selection: Selection): DayRange | null {
  if (selection.start === null || selection.end === null) return null
  return { startsOn: selection.start, endsOn: exclusiveEnd(selection.end) }
}

export function rangeToSelection(range: DayRange | null): Selection {
  return range ? { start: range.startsOn, end: inclusiveEnd(range.endsOn) } : EMPTY_SELECTION
}

export function shiftRange(range: DayRange, by: number): DayRange {
  return { startsOn: addDaysTo(range.startsOn, by), endsOn: addDaysTo(range.endsOn, by) }
}

/**
 * Whether a whole stay can be booked: both ends are days that can be chosen (the last one given the first, so the category's limit and the
 * reach of one bike count), and one bike is free all the way. A day in the middle may be one the shop is closed.
 */
export function canBook(range: DayRange, ctx: Omit<PickContext, 'start'>): boolean {
  const first = range.startsOn
  const last = inclusiveEnd(range.endsOn)
  return (
    isSelectable(first, { ...ctx, start: null }).ok &&
    isSelectable(last, { ...ctx, start: first }).ok &&
    freeForRange(ctx.units, range).length > 0
  )
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run lib/booking/period-selection.test.ts lib/booking/day-availability.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/booking/period-selection.ts lib/booking/period-selection.test.ts
git commit -m "Rent: the selection state of the period picker"
```

---

### Task 3: The data from the database

**Files:**
- Create: `lib/booking/busy-intervals.ts`
- Modify: `lib/booking/catalog.ts` (`listBookableBikes` gets `includeUnavailable`; new `getFocusModel`; the courtesy settle becomes `settleHoldsQuietly`)
- Test: `tests/db/busy-intervals.test.ts`, additions to `tests/db/catalog.test.ts`

**Interfaces:**
- Consumes: `UnitBusy`, `mergeRanges` (Task 1), `occupying()` (`lib/booking/occupancy.ts`).
- Produces:
  ```ts
  // busy-intervals.ts
  export async function getUnitBusyIntervals(options: { modelId?: string; window: DayRange }): Promise<UnitBusy[]>
  // catalog.ts
  export async function settleHoldsQuietly(): Promise<void>
  export async function listBookableBikes(range: DayRange, lang: Locale, options?: { includeUnavailable?: boolean }): Promise<BookableModel[]>
  export interface FocusModel { id: string; name: string; categoryName: string; maxDays: number }
  export async function getFocusModel(modelId: string, lang: Locale): Promise<FocusModel | null>
  ```
  With `includeUnavailable`, every **published** model is returned, those with no bike free having `variants: []` and `totalFree: 0`.

- [ ] **Step 1: Write the failing tests**

`tests/db/busy-intervals.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, bikeModels, bikeUnits } from '@/lib/db'
import { getUnitBusyIntervals } from '@/lib/booking/busy-intervals'
import { createFixture, insertBooking, insertOnlineLine, type Fixture } from './fixtures'
import { reservationValues } from './fixtures'
import { bikeReservations } from '@/lib/db'

const WINDOW = { startsOn: '2031-11-01', endsOn: '2032-05-01' }

describe('getUnitBusyIntervals', () => {
  let fx: Fixture
  beforeEach(async () => {
    fx = await createFixture(2)
    await db.update(bikeModels).set({ isPublished: true }).where(eq(bikeModels.id, fx.modelId))
  })
  afterEach(async () => { await fx.cleanup() })

  const mine = async (options: { modelId?: string } = { modelId: fx.modelId }) =>
    (await getUnitBusyIntervals({ ...options, window: WINDOW })).filter((unit) => unit.modelId === fx.modelId)

  it('lists every bike of a published model, free ones with no busy period', async () => {
    const units = await mine()
    expect(units.map((u) => u.unitId).sort()).toEqual([...fx.unitIds].sort())
    expect(units.every((u) => u.busy.length === 0 && u.retiredOn === null)).toBe(true)
    expect(units[0]).toMatchObject({ sizeId: fx.sizeId, versionId: fx.versionId })
  })

  it('held and confirmed reservations take the bike; expired and cancelled do not', async () => {
    const booking = await insertBooking(fx.customerId, { startsOn: '2031-11-03', endsOn: '2031-11-06' })
    await insertOnlineLine(booking, fx.customerId, fx.unitIds[0], { startsOn: '2031-11-03', endsOn: '2031-11-06' }, 'held')
    await insertOnlineLine(booking, fx.customerId, fx.unitIds[1], { startsOn: '2031-11-03', endsOn: '2031-11-06' }, 'expired')
    const units = await mine()
    expect(units.find((u) => u.unitId === fx.unitIds[0])?.busy).toEqual([{ startsOn: '2031-11-03', endsOn: '2031-11-06' }])
    expect(units.find((u) => u.unitId === fx.unitIds[1])?.busy).toEqual([])
  })

  it('joins periods that touch into one, and keeps the others apart', async () => {
    await db.insert(bikeReservations).values([
      reservationValues(fx.unitIds[0], '2031-11-03', '2031-11-05'),
      reservationValues(fx.unitIds[0], '2031-11-05', '2031-11-07'),
      reservationValues(fx.unitIds[0], '2031-11-10', '2031-11-12'),
    ])
    const busy = (await mine()).find((u) => u.unitId === fx.unitIds[0])?.busy
    expect(busy).toEqual([
      { startsOn: '2031-11-03', endsOn: '2031-11-07' },
      { startsOn: '2031-11-10', endsOn: '2031-11-12' },
    ])
  })

  it('leaves out periods outside the window', async () => {
    await db.insert(bikeReservations).values(reservationValues(fx.unitIds[0], '2030-01-01', '2030-01-05'))
    expect((await mine()).find((u) => u.unitId === fx.unitIds[0])?.busy).toEqual([])
  })

  it('reports the day a bike is retired, and drops a bike retired before the window', async () => {
    await db.update(bikeUnits).set({ retiredOn: '2031-12-01' }).where(eq(bikeUnits.id, fx.unitIds[0]))
    await db.update(bikeUnits).set({ retiredOn: '2031-10-01' }).where(eq(bikeUnits.id, fx.unitIds[1]))
    const units = await mine()
    expect(units.map((u) => u.unitId)).toEqual([fx.unitIds[0]])
    expect(units[0].retiredOn).toBe('2031-12-01')
  })

  it('leaves out the bikes of a model that is not published', async () => {
    await db.update(bikeModels).set({ isPublished: false }).where(eq(bikeModels.id, fx.modelId))
    expect(await mine()).toEqual([])
  })

  it('with a model, returns only its bikes', async () => {
    const all = await getUnitBusyIntervals({ window: WINDOW })
    const only = await getUnitBusyIntervals({ modelId: fx.modelId, window: WINDOW })
    expect(only.every((u) => u.modelId === fx.modelId)).toBe(true)
    expect(all.length).toBeGreaterThanOrEqual(only.length)
  })
})
```

Additions to `tests/db/catalog.test.ts` (inside its `describe`, using its `mine` helper and `fx`):

```ts
  it('with includeUnavailable keeps a published model with no bike free, switched off', async () => {
    const booking = await insertBooking(fx.customerId, RANGE)
    for (const unitId of fx.unitIds) await insertOnlineLine(booking, fx.customerId, unitId, RANGE, 'held')
    expect(await mine()).toBeUndefined()
    const all = await listBookableBikes(RANGE, 'it', { includeUnavailable: true })
    expect(all.find((entry) => entry.id === fx.modelId)).toMatchObject({ totalFree: 0, variants: [], tooLong: false })
  })

  it('with includeUnavailable still leaves out a model that is not published', async () => {
    await db.update(bikeModels).set({ isPublished: false }).where(eq(bikeModels.id, fx.modelId))
    const all = await listBookableBikes(RANGE, 'it', { includeUnavailable: true })
    expect(all.find((entry) => entry.id === fx.modelId)).toBeUndefined()
  })

  it('getFocusModel gives the name, category and limit of a published model, and nothing for an unpublished or unknown one', async () => {
    expect(await getFocusModel(fx.modelId, 'it')).toMatchObject({ id: fx.modelId, name: 'Bici di prova', maxDays: 3 })
    expect(await getFocusModel(crypto.randomUUID(), 'it')).toBeNull()
    await db.update(bikeModels).set({ isPublished: false }).where(eq(bikeModels.id, fx.modelId))
    expect(await getFocusModel(fx.modelId, 'it')).toBeNull()
  })
```
(import `getFocusModel` next to `listBookableBikes`.)

- [ ] **Step 2: Run them and see them fail**

Run: `npm run test:db -- tests/db/busy-intervals.test.ts tests/db/catalog.test.ts`
Expected: FAIL (module and options missing).

- [ ] **Step 3: Write `lib/booking/busy-intervals.ts`**

```ts
import { and, asc, eq, gt, isNull, lt, or } from 'drizzle-orm'
import { db, bikeModels, bikeReservations, bikeUnits } from '@/lib/db'
import type { DayRange } from '@/lib/dates'
import { mergeRanges, type UnitBusy } from './day-availability'
import { occupying } from './occupancy'
import { settleHoldsQuietly } from './catalog'

/**
 * Every bike of a published model (or of one `modelId`) with the periods it is taken inside `window`, the busy ones merged: what the
 * picker needs to grey out days in the browser. A bike taken by a `confirmed` or a `held` reservation is busy (`occupying()`), a bike
 * retired before the window is left out. One statement, so the picture is a single moment; read on every request, never cached
 * (a booking just made has to show).
 */
export async function getUnitBusyIntervals(options: { modelId?: string; window: DayRange }): Promise<UnitBusy[]> {
  await settleHoldsQuietly()
  const { modelId, window } = options
  const rows = await db
    .select({
      unitId: bikeUnits.id,
      modelId: bikeUnits.bikeModelId,
      sizeId: bikeUnits.bikeSizeId,
      versionId: bikeUnits.bikeVersionId,
      retiredOn: bikeUnits.retiredOn,
      startsOn: bikeReservations.startsOn,
      endsOn: bikeReservations.endsOn,
    })
    .from(bikeUnits)
    .innerJoin(bikeModels, eq(bikeModels.id, bikeUnits.bikeModelId))
    .leftJoin(
      bikeReservations,
      and(
        eq(bikeReservations.bikeUnitId, bikeUnits.id),
        occupying(),
        lt(bikeReservations.startsOn, window.endsOn),
        gt(bikeReservations.endsOn, window.startsOn),
      ),
    )
    .where(and(
      eq(bikeModels.isPublished, true),
      modelId ? eq(bikeUnits.bikeModelId, modelId) : undefined,
      or(isNull(bikeUnits.retiredOn), gt(bikeUnits.retiredOn, window.startsOn)),
    ))
    .orderBy(asc(bikeUnits.createdAt), asc(bikeUnits.id))

  const units = new Map<string, UnitBusy & { raw: DayRange[] }>()
  for (const row of rows) {
    const unit = units.get(row.unitId) ?? {
      unitId: row.unitId, modelId: row.modelId, sizeId: row.sizeId, versionId: row.versionId, retiredOn: row.retiredOn, busy: [], raw: [],
    }
    if (row.startsOn !== null && row.endsOn !== null) unit.raw.push({ startsOn: row.startsOn, endsOn: row.endsOn })
    units.set(row.unitId, unit)
  }
  return [...units.values()].map(({ raw, ...unit }) => ({ ...unit, busy: mergeRanges(raw) }))
}
```

- [ ] **Step 4: Change `lib/booking/catalog.ts`**

Replace the settle block in `listBookableBikes` by `await settleHoldsQuietly()`, export that helper, add the option, and add `getFocusModel`:

```ts
/** Settles the bookings whose time has run out so held bikes are free again at once. A courtesy, never a reason to fail: an error is logged. */
export async function settleHoldsQuietly(): Promise<void> {
  if (!paymentsAvailable()) return
  try {
    await settleOverdueHolds()
  } catch (error) {
    console.error('[booking] could not settle the holds before listing', { error: safeErrorSummary(error) })
  }
}
```

In `listBookableBikes(range, lang, options: { includeUnavailable?: boolean } = {})`:

```ts
  await settleHoldsQuietly()
  const free = await getFreeBikes(range)
  const freeIds = [...new Set(free.map((row) => row.bikeModelId))]
  const modelIds = options.includeUnavailable
    ? (await db.select({ id: bikeModels.id }).from(bikeModels).where(eq(bikeModels.isPublished, true))).map((row) => row.id)
    : freeIds
  if (modelIds.length === 0) return []
```
(the rest unchanged: a model with no `free` rows gets `variants: []`, `totalFree: 0`), and

```ts
export interface FocusModel { id: string; name: string; categoryName: string; maxDays: number }

/** The model a person arrived from (`/rent?model=…`): only a published one, or null (an old or typed link falls back to booking by days). */
export async function getFocusModel(modelId: string, lang: Locale): Promise<FocusModel | null> {
  const [row] = await db
    .select({ id: bikeModels.id, category: bikeCategories })
    .from(bikeModels)
    .innerJoin(bikeCategories, eq(bikeCategories.id, bikeModels.categoryId))
    .where(and(eq(bikeModels.id, modelId), eq(bikeModels.isPublished, true)))
  if (!row) return null
  const names = await db
    .select({ locale: bikeModelTranslations.locale, name: bikeModelTranslations.name })
    .from(bikeModelTranslations)
    .where(eq(bikeModelTranslations.bikeModelId, modelId))
  const name = (names.find((entry) => entry.locale === lang) ?? names.find((entry) => entry.locale === 'it') ?? names[0])?.name ?? row.category.name
  return { id: row.id, name, categoryName: row.category.name, maxDays: row.category.maxRentalDays }
}
```
(add `and` to the drizzle import.) `busy-intervals.ts` imports `settleHoldsQuietly` from `./catalog`, and `catalog.ts` does not import `busy-intervals`: no cycle.

- [ ] **Step 5: Run the tests and see them pass**

Run: `npm run test:db -- tests/db/busy-intervals.test.ts tests/db/catalog.test.ts tests/db/availability.test.ts tests/db/occupancy.test.ts`
Expected: PASS (`occupancy.test.ts` checks the statuses written by hand; the new file uses `occupying()`).

- [ ] **Step 6: Commit**

```bash
git add lib/booking/busy-intervals.ts lib/booking/catalog.ts tests/db/busy-intervals.test.ts tests/db/catalog.test.ts
git commit -m "Rent: busy periods of every bike, models kept when none is free, the model a link names"
```

---

### Task 4: Messages (three languages) and the pickup text

**Files:**
- Modify: `messages/it.json`, `messages/en.json`, `messages/de.json` (`rent.*`, `account.rents.pickup_note`, `terms.pickup_body`)
- Test: `lib/booking/terms-text.test.ts` (existing, keep green); `lib/i18n-keys.test.ts` if there is one (keys equal across languages)

**Interfaces:**
- Produces new `rent` keys (all three languages, same names): `day_before`, `day_after`, `change_days`, `legend_off_days`, `legend_off_bike`, `off_past`, `off_far`, `off_no_bike`, `off_no_bike_model`, `off_beyond`, `unavailable_dates`, `see_all_free`, `see_all_bikes`, `bike_mode_label`, `period_summary`. Texts with `{day}` take the day written by `formatDay`. `pickup_note`, `account.rents.pickup_note` and `terms.pickup_body` change.

- [ ] **Step 1: Write the new texts** (Italian is the reference; English and German say the same; German uses "du", like the other booking pages)

| key | it |
|---|---|
| `day_before` | Giorno prima |
| `day_after` | Giorno dopo |
| `change_days` | Cambia |
| `legend_off_days` | I giorni in grigio non si possono scegliere: non c'è nessuna bici libera. |
| `legend_off_bike` | I giorni in grigio non si possono scegliere: questa bici non è libera. |
| `off_past` | {day}, non si prenota più |
| `off_far` | {day}, troppo avanti |
| `off_no_bike` | {day}, nessuna bici libera |
| `off_no_bike_model` | {day}, questa bici non è libera |
| `off_beyond` | {day}, una sola bici non arriva fin qui |
| `unavailable_dates` | Non disponibile in queste date |
| `see_all_free` | Vedi tutte le bici libere in questo periodo |
| `see_all_bikes` | Vedi tutte le bici |
| `bike_mode_label` | Stai prenotando |
| `pickup_note` | Ritiro il primo giorno, riconsegna l'ultimo: entro la chiusura del negozio, perché le bici vanno ricaricate e non si riconsegnano il giorno dopo. Per accordi diversi, chiamaci. |
| `account.rents.pickup_note` | same sentence as `rent.pickup_note` |
| `terms.pickup_body` | Ritiri la bici in negozio il primo giorno, entro la chiusura, e la riconsegni l'ultimo giorno, entro la chiusura: le bici vanno ricaricate, quindi non si riconsegnano il giorno dopo. Per accordi diversi contatta il negozio prima. |

The English and German sentences are written in the same step, in the file, by a small node script (`scripts` are not kept: it goes in the session scratchpad) that reads each JSON, sets the keys and writes `JSON.stringify(data, null, 2) + '\n'` after checking that writing the untouched file gives no diff.

- [ ] **Step 2: Apply, then check**

Run: `npx vitest run lib/booking/terms-text.test.ts lib/privacy-text.test.ts` and `git diff --stat messages/`.
Expected: PASS; only the intended keys changed in each file.

- [ ] **Step 3: Commit**

```bash
git add messages/it.json messages/en.json messages/de.json
git commit -m "Rent: texts of the day picker, and the pickup rule: by the end of the first day, back by the end of the last"
```

---

### Task 5: The picker and the model card

**Files:**
- Create: `components/rent/period-picker.tsx`, `components/rent/model-card.tsx`
- Test: none by DOM (see Global Constraints); the rules they use are tested in Tasks 1–2, the rendering is checked in Task 7.

**Interfaces:**
- Consumes: `isSelectable`, `canBook`, `pickDay`, `rangeToSelection`, `selectionToRange`, `shiftRange`, `UnitBusy`, `formatDay`, `formatDays`, `fill`, shadcn `Calendar`, `Button`.
- Produces:
  ```tsx
  export function PeriodPicker(props: {
    lang: 'it' | 'en' | 'de'
    dict: RentDict
    units: UnitBusy[]
    range: DayRange | null
    minDay: IsoDate
    maxDay: IsoDate
    maxDays: number | null          // the category's limit when booking one bike; null by days
    mode: 'days' | 'bike'           // only chooses the legend and the reason texts
    pending: boolean
    onChange: (range: DayRange) => void
  }): JSX.Element
  export function ModelCard(props: {
    model: BookableModel; lang; dict: RentDict; cart: CartItem[]; media: ReactNode
    onChange: (next: CartItem[]) => void
  }): JSX.Element
  ```

- [ ] **Step 1: `PeriodPicker`.** State: `open` (starts `range === null`), `selection` (starts `rangeToSelection(range)`), `month` (starts at the start of the chosen period or `minDay`). Behaviour:
  - Open: `Calendar` (`mode` not set; `onDayClick` calls `pickDay`, and on a finished selection calls `onChange(selectionToRange(next))` and closes), `numberOfMonths` 1 below `lg`, 2 from `lg` (`matchMedia('(min-width: 1024px)')`, starting at 1), `startMonth`/`endMonth` from `minDay`/`maxDay`, `disabled={(date) => !isSelectable(isoDay(date), ctx).ok}` with `ctx.start` = the first day while only that is chosen, `modifiers` for the chosen days (`range_start`, `range_middle`, `range_end` through `selected={{ from, to }}`), `labels.labelDayButton` returning the reason text (`dict.off_*` filled with `formatDay`) for a disabled day and the plain day otherwise. Grey days: `classNames.disabled` = `bg-muted text-muted-foreground/60` without the opacity of the stock class.
  - Below the grid: the legend (`legend_off_days` or `legend_off_bike`) and `dates_prompt`.
  - Compact (a period chosen and `open` false): a bordered row with the period (`formatDays(range, lang)` and the number of days, as the page had), `‹ day before` and `day after ›` (`Button` `outline` `size="sm"`, `LuChevronLeft`/`LuChevronRight`, disabled when `!canBook(shiftRange(range, ±1), ctx)` or `pending`) and `Change` (`ghost`). A moved period goes up through `onChange`.
  - The root has `aria-live="polite"` on the summary text only; focus is not moved on its own.

- [ ] **Step 2: `ModelCard`.** Moved out of `rent-flow.tsx` and extended: a photo on top (`media`, `h-40`, `rounded-xl` card like `BikeCard`), the model name, category `Badge`, the price of the stay, then the sizes and counters as today. A model with `totalFree === 0` (and not `tooLong`): `opacity-60`, no counters, the text `dict.unavailable_dates`. `tooLong` keeps its message.

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit` and `npx eslint components/rent lib/booking`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/rent/period-picker.tsx components/rent/model-card.tsx
git commit -m "Rent: the period picker (month and compact bar) and the card of a model"
```

---

### Task 6: The page, the two modes, the flow

**Files:**
- Modify: `app/[lang]/rent/page.tsx`, `components/rent/rent-flow.tsx`
- Test: `lib/booking/rent-url.test.ts` (existing, unchanged); browser check in Task 7

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: `RentFlow` props gain `mode: 'days' | 'bike'`, `focus: FocusModel | null`, `units: UnitBusy[]`, `media: Record<string, ReactNode>`; `focusModelId` stays for the address.

- [ ] **Step 1: The page.**
  - `const focus = state.focusModelId ? await getFocusModel(state.focusModelId, lang) : null`; `mode = focus ? 'bike' : 'days'`.
  - `units = await getUnitBusyIntervals({ modelId: focus?.id, window: { startsOn: minDay, endsOn: addDaysTo(today, MAX_DAYS_AHEAD + 1) } })`.
  - `models = range ? await listBookableBikes(range, lang, { includeUnavailable: true }) : []`.
  - Media: `db.select().from(bikeModels).where(inArray(id, models ids))` and, for each, `<Suspense fallback={<MediaPlaceholder />}><BikeCardMediaAsync model={row} title={name} /></Suspense>` (the same pieces `app/[lang]/bikes/page.tsx` uses).
  - The page title area: by days, as today; by bike, the label `bike_mode_label`, the model name and category, and the link `see_all_free` (with a period) or `see_all_bikes` (without), both to `rentHref(lang, { range, cart: [], focusModelId: null })`.
- [ ] **Step 2: `RentFlow`.** Replace the `Calendar` block with `PeriodPicker` (`maxDays: focus?.maxDays ?? null`); `changeDays` becomes `onChange(range)` with the same `router.push(..., { scroll: false })` in a transition. Cards: `models.filter(by mode)` (by bike: only the focus model) rendered with `ModelCard` in a grid `sm:grid-cols-2`, the unavailable ones last. The summary and cart still use **all** `models`, so a bike added in the other mode stays in the cart. Remove `useWideScreen` from the file (the picker has its own).
- [ ] **Step 3: Run everything that exists**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run && npm run test:db`
Expected: all green (`rent-actions`, `checkout`, `catalog`, `my-bookings`, admin layouts and privacy-surface guards included).

- [ ] **Step 4: Commit**

```bash
git add "app/[lang]/rent/page.tsx" components/rent/rent-flow.tsx
git commit -m "Rent: two ways in, by days and by bike, around the picker"
```

---

### Task 7: Try it in a real browser, then publish

- [ ] **Step 1:** dev server from this worktree on port 3000 (`npm run dev` after stopping the old one by PID); fake payments are on there (no `STRIPE_SECRET_KEY` needed; with the key in `.env.local` it is the real Stripe test mode).
- [ ] **Step 2:** with a browser, in it, en and de, at 320, 375 and 1440 px, no horizontal scroll: `/it/rent` (month opens, a past and a taken day cannot be chosen, two taps give the compact bar, ‹ and › move the period and refresh the cards, "Change" reopens the month, a model with no bike free is shown off); `/it/rent?model=<id>` from the "Book" button of a bike page (header with the bike, days where it is taken are grey and cannot be tapped, days past the reach of one bike are grey once the first day is chosen, the link to all bikes keeps the period); an address with an unknown `model` falls back to the by-days page; pay with the test card to the end and see the booking in "My bookings" with the corrected pickup text.
- [ ] **Step 3:** screenshots into the scratchpad (never the repository root), look at them, fix what is wrong.
- [ ] **Step 4:** `docs/ai/ROADMAP.md`: the rent-page line points to the spec and to this plan, part A done, part B waiting; `git status`, PR to `staging`, background merge guard (`scratchpad/merge-when-green.sh`).
