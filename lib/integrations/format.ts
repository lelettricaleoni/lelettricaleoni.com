import { format } from 'date-fns'
import { TZDate } from '@date-fns/tz'

/** A moment as the shop reads it: Europe/Rome whatever the server's clock says. */
export function formatWhen(iso: string | null, whenNone = 'Never'): string {
  if (iso === null) return whenNone
  const date = new TZDate(iso, 'Europe/Rome')
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return format(date, 'd MMM yyyy, HH:mm')
}
