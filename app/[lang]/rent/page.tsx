import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import type { Metadata } from 'next'
import { eq } from 'drizzle-orm'
import { getDictionary, hasLocale } from '../dictionaries'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { RentFlow, type RentAccount } from '@/components/rent/rent-flow'
import { db, customers } from '@/lib/db'
import { hasAdminRole } from '@/lib/admin-users'
import { getCurrentUser } from '@/lib/auth/current-user'
import { listBookableBikes } from '@/lib/booking/catalog'
import { paymentsAvailable } from '@/lib/booking/payments'
import { parseRentState } from '@/lib/booking/rent-url'
import { MAX_DAYS_AHEAD, checkStay } from '@/lib/booking/rules'
import { addDaysTo, todayInRome } from '@/lib/dates'

// Reads the session cookie and the database on every request.
export const instant = false

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  if (!hasLocale(lang)) return {}
  const dict = await getDictionary(lang)
  // A page whose content is chosen in its address: not for search engines (the bikes have their own pages).
  return { title: dict.rent.meta_title, description: dict.rent.meta_description, robots: { index: false, follow: false } }
}

/**
 * The booking page: `/it/rent?from=…&to=…&b=…` (lib/booking/rent-url.ts). It does not exist where payments are not available
 * (production, until Stripe is there): a page that takes bookings must never be reachable without a way to pay.
 */
export default async function RentPage({
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

  const dict = await getDictionary(lang)
  const state = parseRentState(await searchParams)
  const today = todayInRome()
  // A stay outside what can be booked (an old link, a typed address) is ignored, not guessed at.
  const stay = state.range ? checkStay(state.range.startsOn, state.range.endsOn, today) : null
  const range = stay?.ok ? state.range : null
  const models = range ? await listBookableBikes(range, lang) : []

  const user = await getCurrentUser()
  let account: RentAccount = { kind: 'guest' }
  if (user) {
    if (hasAdminRole(user)) account = { kind: 'staff' }
    else {
      const [customer] = await db.select({ phone: customers.phone }).from(customers).where(eq(customers.userId, user.id))
      account = { kind: 'customer', hasPhone: Boolean(customer?.phone) }
    }
  }

  return (
    <>
      <Navbar lang={lang} dict={dict} />
      <main className="w-full pb-16 pt-24">
        <div className="mx-auto max-w-6xl space-y-6 px-4 sm:px-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{dict.rent.title}</h1>
            <p className="mt-2 max-w-xl text-muted-foreground">{dict.rent.subtitle}</p>
          </div>
          <RentFlow
            key={range ? `${range.startsOn}_${range.endsOn}` : 'no-days'}
            lang={lang}
            dict={dict.rent}
            termsHref={`/${lang}/terms`}
            range={range}
            initialCart={range ? state.cart : []}
            focusModelId={state.focusModelId}
            models={models}
            minDay={addDaysTo(today, 1)}
            maxDay={addDaysTo(today, MAX_DAYS_AHEAD)}
            account={account}
          />
        </div>
      </main>
      <Footer lang={lang} dict={dict} />
    </>
  )
}
