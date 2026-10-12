import { TZDate } from '@date-fns/tz'
import { ROME, type IsoDate } from '@/lib/dates'

/** The refund is full up to 09:00 (Rome) of two days before the first day: the pickup is at opening. */
const DEADLINE_DAYS_BEFORE = 2
const DEADLINE_HOUR = 9

/** The last moment a customer can cancel a bike for a full refund. */
export function refundDeadline(startsOn: IsoDate): Date {
  const [year, month, day] = startsOn.split('-').map(Number)
  // TZDate does the calendar arithmetic (months, years, clock changes) in the zone of Rome.
  const deadline = new TZDate(year, month - 1, day - DEADLINE_DAYS_BEFORE, DEADLINE_HOUR, 0, 0, ROME)
  return new Date(deadline.getTime())
}

/** Whether a customer may still cancel a bike that starts on `startsOn` and get everything back. */
export function isRefundable(startsOn: IsoDate, now: Date = new Date()): boolean {
  return now.getTime() <= refundDeadline(startsOn).getTime()
}
