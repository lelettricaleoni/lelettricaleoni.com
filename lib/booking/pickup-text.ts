import { inclusiveEnd, type DayRange } from '@/lib/dates'
import { hoursOn, type ShopSchedule } from '@/lib/shop-schedule'
import { fill, formatDay, formatHours } from './format'

type Lang = 'it' | 'en' | 'de'

/**
 * What the customer is told about picking up and bringing back: the day and the hours of the first day and of the last. Where the shop has no
 * hours on one of them (a closure, a schedule not declared, a stay typed by hand) it is the plain note, which says it without the hours.
 */
export function pickupText(
  range: DayRange, schedule: ShopSchedule, lang: Lang, dict: { pickup_when: string; pickup_note: string },
): string {
  const pickupDay = range.startsOn
  const returnDay = inclusiveEnd(range.endsOn)
  const pickup = hoursOn(schedule, pickupDay)
  const back = hoursOn(schedule, returnDay)
  if (pickup.length === 0 || back.length === 0) return dict.pickup_note
  return fill(dict.pickup_when, {
    pickupDay: formatDay(pickupDay, lang), pickupHours: formatHours(pickup, lang),
    returnDay: formatDay(returnDay, lang), returnHours: formatHours(back, lang),
  })
}
