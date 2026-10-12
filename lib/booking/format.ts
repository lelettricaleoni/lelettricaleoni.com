import { dayToDate, inclusiveEnd, type DayRange, type IsoDate } from '@/lib/dates'

type Lang = 'it' | 'en' | 'de'
const INTL_LOCALE = { it: 'it-IT', en: 'en-GB', de: 'de-DE' } as const

/** "3 – 5 nov": the first and the last day of a stay, both included, in the language of the page. */
export function formatDays(range: DayRange, lang: Lang): string {
  const format = new Intl.DateTimeFormat(INTL_LOCALE[lang], { day: 'numeric', month: 'short' })
  const first = dayToDate(range.startsOn)
  const last = dayToDate(inclusiveEnd(range.endsOn))
  return first.getTime() === last.getTime() ? format.format(first) : format.formatRange(first, last)
}

/** "lun 3 nov": one day with its weekday. */
export function formatDay(day: IsoDate, lang: Lang): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[lang], { weekday: 'short', day: 'numeric', month: 'short' }).format(dayToDate(day))
}

/** Puts values into the `{name}` places of a text from `messages/*.json`; a name it does not know is left as it is. */
export function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in values ? String(values[name]) : whole))
}
