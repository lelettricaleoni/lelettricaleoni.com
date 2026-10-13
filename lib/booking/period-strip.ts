import { addDaysTo, type IsoDate } from '@/lib/dates'
import { isoWeekday } from '@/lib/shop-schedule'

/*
 * The week strip of the booking page (the bar of seven days with an arrow on each side): which week is shown, and where the arrows can go.
 * A week is shown from its Monday, so a weekday always sits under the same name; the weeks that can be shown are those from the one of the
 * first day that can be booked to the one of the last.
 */

export function mondayOf(day: IsoDate): IsoDate {
  return addDaysTo(day, 1 - isoWeekday(day))
}

/** The seven days from `weekStart`, which is a Monday. */
export function weekDays(weekStart: IsoDate): IsoDate[] {
  return Array.from({ length: 7 }, (_, index) => addDaysTo(weekStart, index))
}

interface Bounds { minDay: IsoDate; maxDay: IsoDate }

/** The Monday of the week to show for `day`, kept inside the weeks that can be shown. */
export function weekStartFor(day: IsoDate, { minDay, maxDay }: Bounds): IsoDate {
  const week = mondayOf(day)
  const first = mondayOf(minDay)
  const last = mondayOf(maxDay)
  if (week < first) return first
  if (week > last) return last
  return week
}

/** The week after (`1`) or before (`-1`), or null when there is none to show. */
export function pageWeek(weekStart: IsoDate, by: 1 | -1, bounds: Bounds): IsoDate | null {
  const next = addDaysTo(weekStart, 7 * by)
  return next < mondayOf(bounds.minDay) || next > mondayOf(bounds.maxDay) ? null : next
}
