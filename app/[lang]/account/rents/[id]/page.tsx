import Link from 'next/link'
import { notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDictionary, hasLocale } from '../../../dictionaries'
import { StatusBadge } from '@/components/account/booking-parts'
import { CancelBikeButton } from '@/components/account/cancel-bike-button'
import { Flash } from '@/components/account/flash'
import { db, customers } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth/current-user'
import { fill, formatDays, formatDeadline } from '@/lib/booking/format'
import { getMyBooking } from '@/lib/booking/my-bookings'
import { confirmMyBooking } from '@/lib/booking/rent-actions'
import { formatPrice } from '@/lib/money'

export const instant = false

/**
 * One booking of the person: its days, its bikes, what each cost, and "Cancel this bike" where a refund is still due.
 * Where the payment page sends the person back (`?paid=1`) this page first asks the same idempotent function that the webhook asks to
 * confirm the booking, so what is shown is true even when the webhook has not arrived yet.
 */
export default async function RentPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string; id: string }>
  searchParams: Promise<{ paid?: string }>
}) {
  const { lang, id } = await params
  if (!hasLocale(lang) || !z.uuid().safeParse(id).success) notFound()
  const user = (await getCurrentUser())!
  const d = (await getDictionary(lang)).account.rents
  const { paid } = await searchParams

  let banner: { error?: string; info?: string } = {}
  if (paid === '1') {
    const result = await confirmMyBooking(user, id)
    if (result.status === 'confirmed') banner = { info: d.paid_confirmed }
    else if (result.status === 'in_progress') banner = { info: d.paid_waiting }
    else if (result.status === 'refunded') banner = { error: d.paid_refunded }
    else if (result.status === 'not_paid') banner = { error: d.paid_none }
  }

  const [customer] = await db.select({ id: customers.id }).from(customers).where(eq(customers.userId, user.id))
  const booking = customer ? await getMyBooking(customer.id, id, lang) : null
  if (!booking) notFound()

  const cancelLabels = {
    button: d.cancel_bike, title: d.cancel_title, body: d.cancel_body, confirm: d.cancel_confirm, keep: d.cancel_keep,
    done: d.cancelled_ok, doneNothing: d.cancelled_ok_nothing, errors: d.cancel_errors,
  }

  return (
    <>
      <div className="space-y-1">
        <Link href={`/${lang}/account/rents`} className="text-sm text-primary underline-offset-2 hover:underline">{d.back}</Link>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold text-foreground">{formatDays({ startsOn: booking.startsOn, endsOn: booking.endsOn }, lang, { year: true })}</h1>
          <StatusBadge status={booking.status} labels={d.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {fill(d.booked_on, { date: new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', year: 'numeric' }).format(booking.createdAt) })}
        </p>
      </div>
      <Flash error={banner.error} info={banner.info} />

      <ul className="divide-y rounded-xl border bg-card shadow-sm">
        {booking.bikes.map((bike) => (
          <li key={bike.reservationId} className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-foreground">{fill(d.bike_line, { model: bike.modelName, size: bike.sizeName })}</p>
                <p className="text-sm tabular-nums text-muted-foreground">{formatPrice(bike.amountCents, lang)}</p>
              </div>
              <StatusBadge status={bike.status} labels={d.bike_status} />
            </div>
            {bike.refund && (
              <p className="text-sm text-muted-foreground">{fill(d.refund_line, { amount: formatPrice(bike.refund.amountCents, lang) })}</p>
            )}
            {bike.canCancel && (
              <CancelBikeButton
                reservationId={bike.reservationId}
                lang={lang}
                amountCents={bike.amountCents}
                deadlineLabel={formatDeadline(bike.refundableUntil, lang)}
                helpEmail={d.help_email}
                labels={cancelLabels}
              />
            )}
            {bike.status === 'confirmed' && !bike.canCancel && (
              <p className="text-sm text-muted-foreground">
                {fill(d.cancel_late, { deadline: formatDeadline(bike.refundableUntil, lang), email: d.help_email })}
              </p>
            )}
          </li>
        ))}
      </ul>

      <div className="flex items-baseline justify-between rounded-xl border bg-card p-4 shadow-sm">
        <span className="font-semibold text-foreground">{d.total}</span>
        <span className="text-xl font-bold tabular-nums text-primary">{formatPrice(booking.totalCents, lang)}</span>
      </div>
      <p className="text-sm text-muted-foreground">{d.pickup_note}</p>
    </>
  )
}
