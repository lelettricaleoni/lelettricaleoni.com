import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { fill, formatDays } from '@/lib/booking/format'
import type { MyBooking } from '@/lib/booking/my-bookings'
import { formatPrice } from '@/lib/money'
import { cn } from '@/lib/utils'
import type itMessages from '@/messages/it.json'

type Lang = 'it' | 'en' | 'de'
export type RentsDict = (typeof itMessages)['account']['rents']

const STATUS_STYLE: Record<string, string> = {
  confirmed: 'border-green-200 bg-green-50 text-green-700',
  pending: 'border-transparent bg-muted text-foreground',
  cancelled: 'border-transparent bg-muted text-muted-foreground',
  expired: 'border-transparent bg-muted text-muted-foreground',
  failed_refunded: 'border-transparent bg-muted text-muted-foreground',
  held: 'border-transparent bg-muted text-foreground',
}

/** A status as a small label (a pillar of the design rules: a pill is for labels, never for actions). */
export function StatusBadge({ status, labels }: { status: string; labels: Record<string, string> }) {
  return <Badge variant="outline" className={cn('shrink-0 font-medium', STATUS_STYLE[status])}>{labels[status] ?? status}</Badge>
}

/** "2 × Flyer Uproc 2 · taglia L, 1 × …": what a booking is made of, in a line. */
function bikesLine(booking: MyBooking, dict: RentsDict): string {
  const groups = new Map<string, { count: number; text: string }>()
  for (const bike of booking.bikes) {
    const key = `${bike.modelName}|${bike.sizeName}`
    const text = fill(dict.bike_line, { model: bike.modelName, size: bike.sizeName })
    groups.set(key, { count: (groups.get(key)?.count ?? 0) + 1, text })
  }
  return [...groups.values()].map(({ count, text }) => (count > 1 ? `${count} × ${text}` : text)).join(', ')
}

/** One booking in the list: its days, what it is made of, its state and what it cost. The whole card opens it. */
export function BookingCard({ booking, lang, dict }: { booking: MyBooking; lang: Lang; dict: RentsDict }) {
  return (
    <Link
      href={`/${lang}/account/rents/${booking.id}`}
      className="block rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-foreground">{formatDays({ startsOn: booking.startsOn, endsOn: booking.endsOn }, lang, { year: true })}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{bikesLine(booking, dict)}</p>
        </div>
        <StatusBadge status={booking.status} labels={dict.status} />
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted-foreground">
          {fill(dict.booked_on, { date: new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' }).format(booking.createdAt) })}
        </span>
        <span className="font-semibold tabular-nums text-foreground">{formatPrice(booking.totalCents, lang)}</span>
      </div>
    </Link>
  )
}
