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
