import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import type { Metadata } from 'next'
import { eq, inArray } from 'drizzle-orm'
import { getDictionary, hasLocale } from '../dictionaries'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { BikeCardMediaAsync } from '@/components/bike-card-media-async'
import { RentFlow, type RentAccount } from '@/components/rent/rent-flow'
import { Skeleton } from '@/components/ui/skeleton'
import { db, bikeModels, customers } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth/current-user'
import { getUnitBusyIntervals } from '@/lib/booking/busy-intervals'
import { getFocusModel, listBookableBikes } from '@/lib/booking/catalog'
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
 * The booking page: `/it/rent?from=…&to=…&b=…` (lib/booking/rent-url.ts), by days; with `model=<uuid>` (the "Book" button of a bike) it is
 * by bike: only that model, and the days that bike is taken cannot be chosen. A `model` that is not a published one is ignored. It does not exist where payments are not available
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
  const minDay = addDaysTo(today, 1)
  const maxDay = addDaysTo(today, MAX_DAYS_AHEAD)
  const focus = state.focusModelId ? await getFocusModel(state.focusModelId, lang) : null
  const mode = focus ? 'bike' : 'days'
  // The busy periods of the bikes (of the model, by bike) for everything that can be booked: the picker greys the days in the browser.
  const units = await getUnitBusyIntervals({ modelId: focus?.id, window: { startsOn: minDay, endsOn: addDaysTo(maxDay, 1) } })
  // Every published model, the ones with no bike free for the days switched off; the cart and the summary use them all.
  const models = range ? await listBookableBikes(range, lang, { includeUnavailable: true }) : []
  const rows = models.length > 0 ? await db.select().from(bikeModels).where(inArray(bikeModels.id, models.map((model) => model.id))) : []
  const media = Object.fromEntries(models.flatMap((model) => {
    const row = rows.find((entry) => entry.id === model.id)
    return row ? [[model.id, (
      <Suspense key={model.id} fallback={<Skeleton className="h-40 w-full rounded-none" />}>
        <BikeCardMediaAsync model={row} title={model.name} />
      </Suspense>
    )]] : []
  }))

  const user = await getCurrentUser()
  let account: RentAccount = { kind: 'guest' }
  if (user) {
    const [customer] = await db.select({ phone: customers.phone }).from(customers).where(eq(customers.userId, user.id))
    account = { kind: 'customer', hasPhone: Boolean(customer?.phone) }
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
            focusModelId={focus?.id ?? null}
            mode={mode}
            focus={focus}
            units={units}
            models={models}
            media={media}
            minDay={minDay}
            maxDay={maxDay}
            account={account}
          />
        </div>
      </main>
      <Footer lang={lang} dict={dict} />
    </>
  )
}
