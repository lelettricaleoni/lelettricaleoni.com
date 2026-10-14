import { notFound, redirect } from 'next/navigation'
import { connection } from 'next/server'
import type { Metadata } from 'next'
import { eq } from 'drizzle-orm'
import { getDictionary, hasLocale } from '../../dictionaries'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { getModelMedia } from '@/components/bike-model-media'
import { CheckoutForm } from '@/components/rent/checkout-form'
import { db, customers } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth/current-user'
import { cartLines, cartTotalCents, sanitizeCart } from '@/lib/booking/cart'
import { listBookableBikes } from '@/lib/booking/catalog'
import { paymentsAvailable } from '@/lib/booking/payments'
import { pickupText } from '@/lib/booking/pickup-text'
import { checkoutHref, parseRentState, rentHref } from '@/lib/booking/rent-url'
import { checkStay } from '@/lib/booking/rules'
import { todayInRome } from '@/lib/dates'
import { isClosedOn } from '@/lib/shop-schedule'
import { loadShopSchedule } from '@/lib/shop-schedule-data'

// Reads the session cookie and the database on every request.
export const instant = false

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  if (!hasLocale(lang)) return {}
  const dict = await getDictionary(lang)
  return { title: dict.rent.checkout_meta_title, robots: { index: false, follow: false } }
}

/**
 * The checkout page: `/it/rent/checkout?from=…&to=…&b=…`, the same address as the booking page (lib/booking/rent-url.ts). It shows the
 * booking, the pickup and return, the terms and Pay. What the address says is checked against what is free NOW: a stay that cannot be
 * booked, or a booking with nothing left in it, goes back to the booking page; a bike that was taken in the meantime leaves it and the
 * person is told. Anybody not signed in goes to sign in and comes back here. Like the booking page it does not exist where payments are
 * not available (production, until Stripe is there).
 */
export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { lang } = await params
  if (!hasLocale(lang)) notFound()
  if (!paymentsAvailable()) notFound()
  await connection()

  const state = parseRentState(await searchParams)
  const today = todayInRome()
  const schedule = await loadShopSchedule()
  const stay = state.range ? checkStay(state.range.startsOn, state.range.endsOn, today, { isClosed: (day) => isClosedOn(schedule, day) }) : null
  const range = stay?.ok ? state.range : null
  // Nothing to pay for: back to choosing.
  if (!range) redirect(rentHref(lang, { range: null, cart: [], focusModelId: null }))

  const user = await getCurrentUser()
  if (!user) redirect(`/${lang}/login?next=${encodeURIComponent(checkoutHref(lang, state))}`)

  const dict = await getDictionary(lang)
  const models = await listBookableBikes(range, lang, { includeUnavailable: true })
  const cart = sanitizeCart(state.cart, models)
  const lines = cartLines(cart, models)
  if (lines.length === 0) redirect(rentHref(lang, { range, cart: [], focusModelId: null }))

  const [customer] = await db.select({ phone: customers.phone }).from(customers).where(eq(customers.userId, user.id))
  const media = await getModelMedia(models.filter((model) => lines.some((line) => line.bikeModelId === model.id)))

  return (
    <>
      <Navbar lang={lang} dict={dict} />
      <main className="w-full pb-16 pt-24">
        <div className="mx-auto max-w-6xl space-y-6 px-4 sm:px-6">
          <h1 className="text-3xl font-bold text-foreground">{dict.rent.checkout_title}</h1>
          <CheckoutForm
            lang={lang}
            dict={dict.rent}
            termsHref={`/${lang}/terms`}
            selfHref={checkoutHref(lang, { range, cart, focusModelId: null })}
            editHref={rentHref(lang, { range, cart, focusModelId: null })}
            range={range}
            cart={cart}
            lines={lines}
            total={cartTotalCents(lines)}
            pickup={pickupText(range, schedule, lang, dict.rent)}
            needsPhone={!customer?.phone}
            changed={cart.length !== state.cart.length || cart.some((item, i) => item.quantity !== state.cart[i]?.quantity)}
            media={media}
          />
        </div>
      </main>
      <Footer lang={lang} dict={dict} />
    </>
  )
}
