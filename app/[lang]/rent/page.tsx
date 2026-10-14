import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import type { Metadata } from 'next'
import { getDictionary, hasLocale } from '../dictionaries'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { getModelMedia } from '@/components/bike-model-media'
import { RentFlow } from '@/components/rent/rent-flow'
import { getUnitBusyIntervals } from '@/lib/booking/busy-intervals'
import { getFocusModel, listBookableBikes } from '@/lib/booking/catalog'
import { paymentsAvailable } from '@/lib/booking/payments'
import { parseRentState } from '@/lib/booking/rent-url'
import { MAX_DAYS_AHEAD, checkStay } from '@/lib/booking/rules'
import { addDaysTo, todayInRome } from '@/lib/dates'
import { firstBookableDay } from '@/lib/booking/period-selection'
import { isClosedOn } from '@/lib/shop-schedule'
import { loadShopSchedule } from '@/lib/shop-schedule-data'

// Reads the database on every request.
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
  const schedule = await loadShopSchedule()
  const stay = state.range ? checkStay(state.range.startsOn, state.range.endsOn, today, { isClosed: (day) => isClosedOn(schedule, day) }) : null
  const requested = stay?.ok ? state.range : null
  const minDay = addDaysTo(today, 1)
  const maxDay = addDaysTo(today, MAX_DAYS_AHEAD)
  const focus = state.focusModelId ? await getFocusModel(state.focusModelId, lang) : null
  const mode = focus ? 'bike' : 'days'
  // The busy periods of the bikes (of the model, by bike) for everything that can be booked: the picker greys the days in the browser.
  const units = await getUnitBusyIntervals({ modelId: focus?.id, window: { startsOn: minDay, endsOn: addDaysTo(maxDay, 1) } })
  // Nothing chosen (or a link that cannot be used): the page opens on tomorrow, or the first day after it that can be booked, so there are
  // results at once. A link that names a period keeps it.
  const firstDay = requested ? null : firstBookableDay({ units, minDay, maxDay, isClosed: (day) => isClosedOn(schedule, day) })
  const range = requested ?? (firstDay ? { startsOn: firstDay, endsOn: addDaysTo(firstDay, 1) } : null)
  // Every published model, the ones with no bike free for the days switched off; the cart and the summary use them all.
  const models = range ? await listBookableBikes(range, lang, { includeUnavailable: true }) : []
  const media = await getModelMedia(models)

  return (
    <>
      <Navbar lang={lang} dict={dict} />
      <main className="w-full pb-16 pt-24">
        <div className="mx-auto max-w-6xl space-y-6 px-4 sm:px-6">
          <h1 className="text-3xl font-bold text-foreground">{dict.rent.title}</h1>
          <RentFlow
            key={range ? `${range.startsOn}_${range.endsOn}` : 'no-days'}
            lang={lang}
            dict={dict.rent}
            range={range}
            initialCart={range ? state.cart : []}
            focusModelId={focus?.id ?? null}
            mode={mode}
            focus={focus}
            units={units}
            schedule={schedule}
            models={models}
            media={media}
            minDay={minDay}
            maxDay={maxDay}
          />
        </div>
      </main>
      <Footer lang={lang} dict={dict} />
    </>
  )
}
