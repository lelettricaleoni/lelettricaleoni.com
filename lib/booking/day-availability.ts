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
