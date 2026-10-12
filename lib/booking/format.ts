import { dayToDate, inclusiveEnd, type DayRange, type IsoDate } from '@/lib/dates'
import type { HoursRange } from '@/lib/shop-schedule'

type Lang = 'it' | 'en' | 'de'
const INTL_LOCALE = { it: 'it-IT', en: 'en-GB', de: 'de-DE' } as const

/** "3 – 5 nov": the first and the last day of a stay, both included, in the language of the page (`year`: "3 – 5 nov 2031", `weekday`: "lun 3 – mer 5 nov"). */
export function formatDays(range: DayRange, lang: Lang, options: { year?: boolean; weekday?: boolean } = {}): string {
  const format = new Intl.DateTimeFormat(INTL_LOCALE[lang], { ...(options.weekday ? { weekday: 'short' } : {}), day: 'numeric', month: 'short', ...(options.year ? { year: 'numeric' } : {}) })
  const first = dayToDate(range.startsOn)
  const last = dayToDate(inclusiveEnd(range.endsOn))
  if (first.getTime() === last.getTime()) return format.format(first)
  // `formatRange` writes the weekday and the separator differently in Node and in the browser (a hydration mismatch): with the weekday the two days are written one by one.
  return options.weekday ? `${format.format(first)} – ${format.format(last)}` : format.formatRange(first, last)
}

/** "lun 3 nov": one day with its weekday. */
export function formatDay(day: IsoDate, lang: Lang): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[lang], { weekday: 'short', day: 'numeric', month: 'short' }).format(dayToDate(day))
}

/** "09:00–13:00 and 14:00–19:00": the ranges a shop is open in a day, joined with the "and" of the language of the page. */
export function formatHours(ranges: HoursRange[], lang: Lang): string {
  return new Intl.ListFormat(INTL_LOCALE[lang], { style: 'long', type: 'conjunction' })
    .format(ranges.map((range) => `${range.opensAt}–${range.closesAt}`))
}

/** Puts values into the `{name}` places of a text from `messages/*.json`; a name it does not know is left as it is. */
export function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in values ? String(values[name]) : whole))
}

/** "09:15": the time of a moment in Rome, whatever clock the server has. */
export function formatTime(moment: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[lang], { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Rome' }).format(moment)
}

/** "mon 8 December, 09:00": a moment, always in the time of Rome (the shop's), whatever clock the server has. */
export function formatDeadline(moment: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[lang], {
    weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Rome',
  }).format(moment)
}
