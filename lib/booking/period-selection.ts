import { addDaysTo, exclusiveEnd, inclusiveEnd, type DayRange, type IsoDate } from '@/lib/dates'
import { isSelectable, type PickContext } from './day-availability'

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

/**
 * The day the booking page opens on, so that there are results at once: the first day, from tomorrow on, that can be chosen as a first
 * day (the shop is open and a bike is free), or null when there is none in the whole window.
 */
export function firstBookableDay(ctx: Pick<PickContext, 'units' | 'minDay' | 'maxDay' | 'isClosed'>): IsoDate | null {
  for (let day = ctx.minDay; day <= ctx.maxDay; day = addDaysTo(day, 1)) {
    if (isSelectable(day, { ...ctx, start: null, maxDays: null }).ok) return day
  }
  return null
}
