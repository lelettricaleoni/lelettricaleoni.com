import Link from 'next/link'
import { notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getDictionary, hasLocale } from '../../dictionaries'
import { BookingCard } from '@/components/account/booking-parts'
import { PageTitle } from '@/components/account/flash'
import { getModelMedia } from '@/components/bike-model-media'
import { Button } from '@/components/ui/button'
import { db, customers } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth/current-user'
import { listMyBookings } from '@/lib/booking/my-bookings'
import { paymentsAvailable } from '@/lib/booking/payments'

export const instant = false

/** The bookings the person made on the site, the coming ones first. Those made at the counter are not here: they are the shop's record. */
export default async function RentsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!hasLocale(lang)) notFound()
  // The layout has already sent somebody who is not signed in to the sign-in page.
  const user = (await getCurrentUser())!
  const d = (await getDictionary(lang)).account.rents

  const [customer] = await db.select({ id: customers.id }).from(customers).where(eq(customers.userId, user.id))
  const { upcoming, past } = customer ? await listMyBookings(customer.id, lang) : { upcoming: [], past: [] }
  // The first photo of every bike model that appears, so a booking is recognised at a glance.
  const media = await getModelMedia([...upcoming, ...past].flatMap((booking) => booking.bikes.map((bike) => ({ id: bike.modelId, name: bike.modelName }))))

  return (
    <>
      <PageTitle title={d.title} subtitle={d.subtitle} />
      {upcoming.length === 0 && past.length === 0 ? (
        <div className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">{d.empty}</p>
          {paymentsAvailable() && <Button asChild><Link href={`/${lang}/rent`}>{d.empty_cta}</Link></Button>}
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">{d.upcoming}</h2>
              {upcoming.map((booking) => <BookingCard key={booking.id} booking={booking} lang={lang} dict={d} media={media} />)}
            </section>
          )}
          {past.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">{d.past}</h2>
              {past.map((booking) => <BookingCard key={booking.id} booking={booking} lang={lang} dict={d} media={media} />)}
            </section>
          )}
        </>
      )}
    </>
  )
}
