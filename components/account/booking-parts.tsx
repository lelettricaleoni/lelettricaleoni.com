import type { ReactNode } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { fill, formatDays, formatTime } from '@/lib/booking/format'
import type { MyBooking } from '@/lib/booking/my-bookings'
import { formatPrice } from '@/lib/money'
import { cn } from '@/lib/utils'
import { CompletePaymentButton } from './complete-payment-button'
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

/**
 * What is left to do on a booking that is waiting for its payment: until when the bikes are held and "Complete payment", or, when the time
 * has run out, that the bikes were released and the way to book again. Nothing for any other booking.
 */
export function PaymentStrip({ booking, lang, dict, className }: { booking: MyBooking; lang: Lang; dict: RentsDict; className?: string }) {
  if (booking.status !== 'pending') return null
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      {booking.canPay && booking.holdExpiresAt ? (
        <>
          <p className="text-sm text-foreground">{fill(dict.pay_until, { time: formatTime(booking.holdExpiresAt, lang) })}</p>
          <CompletePaymentButton bookingId={booking.id} lang={lang} labels={{ button: dict.pay_now, errors: dict.pay_errors }} />
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{dict.pay_expired}</p>
          <Button asChild variant="outline" size="sm"><Link href={`/${lang}/rent`}>{dict.pay_again}</Link></Button>
        </>
      )}
    </div>
  )
}

/**
 * One booking in the list: the photo of its first bike, its days, what it is made of, its state and what it cost. The card opens it; one that
 * waits for its payment has "Complete payment" under it (a button cannot live inside the link, so it sits beside it).
 */
export function BookingCard({
  booking, lang, dict, media,
}: { booking: MyBooking; lang: Lang; dict: RentsDict; media: Record<string, ReactNode> }) {
  const first = booking.bikes[0]
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md">
      <Link href={`/${lang}/account/rents/${booking.id}`} className="flex flex-col gap-3 p-4 sm:flex-row sm:gap-4">
        <div className="relative h-36 w-full shrink-0 overflow-hidden rounded-lg bg-white sm:h-24 sm:w-36">
          {first && media[first.modelId]}
        </div>
        <div className="min-w-0 flex-1">
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
        </div>
      </Link>
      <PaymentStrip booking={booking} lang={lang} dict={dict} className="border-t px-4 py-3" />
    </div>
  )
}
