import { TZDate } from '@date-fns/tz'
import {
  addDays, addMonths, areIntervalsOverlapping, differenceInCalendarDays, eachDayOfInterval,
  endOfMonth, format, getDate, isValid, isWeekend, parse, startOfMonth,
} from 'date-fns'

/**
 * A calendar day as 'YYYY-MM-DD'. Never a `Date`: a Date is an instant, a rental day is not,
 * and the Vercel server runs in UTC, so after 22:00 in Rome it already sees tomorrow.
 */
export type IsoDate = string
/** A calendar month as 'YYYY-MM'. */
export type IsoMonth = string
export interface DayRange { startsOn: IsoDate; endsOn: IsoDate }

export const ROME = 'Europe/Rome'

const DAY_FORMAT = 'yyyy-MM-dd'
const MONTH_FORMAT = 'yyyy-MM'
const REFERENCE = new Date(0)

// A day string becomes a local-midnight Date only to be handed to date-fns, and goes straight
// back to a string. The one export that returns a Date (`dayToDate`, for the calendar widget)
// says so.
function parseDay(day: IsoDate): Date {
  return parse(day, DAY_FORMAT, REFERENCE)
}

function parseMonthStart(month: IsoMonth): Date {
  return parse(month, MONTH_FORMAT, REFERENCE)
}

export function todayInRome(now: Date = new Date()): IsoDate {
  return format(new TZDate(now, ROME), DAY_FORMAT)
}

export function currentMonthInRome(now: Date = new Date()): IsoMonth {
  return format(new TZDate(now, ROME), MONTH_FORMAT)
}

/** From the calendar widget (react-day-picker hands out local-midnight Dates) to a day string. */
export function isoDay(date: Date): IsoDate {
  return format(date, DAY_FORMAT)
}

/** For the calendar widget only: its `selected`, `disabled` and `defaultMonth` props want Dates. */
export function dayToDate(day: IsoDate): Date {
  return parseDay(day)
}

export function isValidDay(value: string): boolean {
  const parsed = parseDay(value)
  // date-fns accepts '2026-7-1': the round trip makes the format strict.
  return isValid(parsed) && format(parsed, DAY_FORMAT) === value
}

export function addDaysTo(day: IsoDate, amount: number): IsoDate {
  return format(addDays(parseDay(day), amount), DAY_FORMAT)
}

/** The database stores the end exclusive; people think in "last day included". */
export function exclusiveEnd(lastDay: IsoDate): IsoDate {
  return addDaysTo(lastDay, 1)
}

export function inclusiveEnd(endsOn: IsoDate): IsoDate {
  return addDaysTo(endsOn, -1)
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return differenceInCalendarDays(parseDay(to), parseDay(from))
}

export function parseMonth(value: string | undefined): IsoMonth | null {
  if (!value) return null
  const parsed = parseMonthStart(value)
  return isValid(parsed) && format(parsed, MONTH_FORMAT) === value ? value : null
}

export function shiftMonth(month: IsoMonth, by: number): IsoMonth {
  return format(addMonths(parseMonthStart(month), by), MONTH_FORMAT)
}

export function monthDays(month: IsoMonth): IsoDate[] {
  const start = startOfMonth(parseMonthStart(month))
  return eachDayOfInterval({ start, end: endOfMonth(start) }).map((date) => format(date, DAY_FORMAT))
}

export function monthTitle(month: IsoMonth): string {
  return format(parseMonthStart(month), 'LLLL yyyy')
}

export function dayOfMonth(day: IsoDate): number {
  return getDate(parseDay(day))
}

export function weekdayLetter(day: IsoDate): string {
  return format(parseDay(day), 'EEEEE')
}

export function isWeekendDay(day: IsoDate): boolean {
  return isWeekend(parseDay(day))
}

/** Ranges are [startsOn, endsOn): one that ends the day another starts does not overlap it. */
export function rangesOverlap(a: DayRange, b: DayRange): boolean {
  return areIntervalsOverlapping(
    { start: parseDay(a.startsOn), end: parseDay(a.endsOn) },
    { start: parseDay(b.startsOn), end: parseDay(b.endsOn) },
    { inclusive: false },
  )
}

export type RangeResult =
  | { ok: true; startsOn: IsoDate; endsOn: IsoDate }
  | { ok: false; reason: 'invalid_day' | 'end_before_start' }

/** First and last day included, as a person gives them, to the stored [startsOn, endsOn). */
export function buildRange(firstDay: string, lastDay: string): RangeResult {
  if (!isValidDay(firstDay) || !isValidDay(lastDay)) return { ok: false, reason: 'invalid_day' }
  if (daysBetween(firstDay, lastDay) < 0) return { ok: false, reason: 'end_before_start' }
  return { ok: true, startsOn: firstDay, endsOn: exclusiveEnd(lastDay) }
}
