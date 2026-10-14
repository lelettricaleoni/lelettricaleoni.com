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

/**
 * The days among `days` on which the shop is closed, for a calendar that paints them. A shop with no weekly hours declared at all is not "closed
 * every day": nothing is known, so nothing is painted.
 */
export function closedDaysAmong(schedule: ShopSchedule, days: IsoDate[]): IsoDate[] {
  if (Object.values(schedule.weekly).every((ranges) => ranges.length === 0)) return []
  return days.filter((day) => isClosedOn(schedule, day))
}

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
