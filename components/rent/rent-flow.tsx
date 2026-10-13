'use client'

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useReservationsRealtime } from '@/components/use-reservations-realtime'
import { cartLines, cartTotalCents, sanitizeCart, totalBikes } from '@/lib/booking/cart'
import type { BookableModel, FocusModel } from '@/lib/booking/catalog'
import type { UnitBusy } from '@/lib/booking/day-availability'
import { fill, formatDays } from '@/lib/booking/format'
import { checkoutHref, rentHref } from '@/lib/booking/rent-url'
import { MAX_RENTAL_DAYS, type CartItem } from '@/lib/booking/rules'
import { coalesce } from '@/lib/coalesce'
import { daysBetween, type DayRange, type IsoDate } from '@/lib/dates'
import { formatPrice } from '@/lib/money'
import type { ShopSchedule } from '@/lib/shop-schedule'
import { cn } from '@/lib/utils'
import { ModelCard } from './model-card'
import { PeriodPicker } from './period-picker'
import type itMessages from '@/messages/it.json'

type Lang = 'it' | 'en' | 'de'
export type RentDict = (typeof itMessages)['rent']

/**
 * The booking page: when, which bikes, and a short summary that leads to the checkout page (`checkout-form.tsx`: terms, details, payment). The days live in the ADDRESS and change it through the router
 * (the server then counts the bikes free for them); the cart lives here and is copied into the address as it changes, without leaving
 * the page, so Back works and a link can be shared. Remounted by the page whenever the days change (`key`), which clears the cart.
 *
 * Two ways in (`mode`): by days (`/rent`: the period first, then the models free in it) and by bike (`/rent?model=…`: one model, and the
 * picker greys out the days that bike is taken). While the page is open it follows the bookings of everybody else: when a bike is taken
 * or freed the page is read again (`router.refresh`), the picker greys the new day and a cart line that is no longer free leaves the cart.
 *
 * What is shown is an estimate: the server prices, checks and holds when the person pays.
 */
export function RentFlow({
  lang, dict, range, initialCart, focusModelId, mode, focus, units, schedule, models, media, minDay, maxDay,
}: {
  lang: Lang
  dict: RentDict
  range: DayRange | null
  initialCart: CartItem[]
  focusModelId: string | null
  mode: 'days' | 'bike'
  focus: FocusModel | null
  units: UnitBusy[]
  schedule: ShopSchedule
  models: BookableModel[]
  /** The photo of each model, by id (server components, so they cannot be made here). */
  media: Record<string, ReactNode>
  minDay: IsoDate
  maxDay: IsoDate
}) {
  const router = useRouter()
  const [navigating, startNavigation] = useTransition()
  const [cart, setCart] = useState<CartItem[]>(() => sanitizeCart(initialCart, models))
  const [notice, setNotice] = useState<string | null>(null)

  function changeDays(next: DayRange) {
    startNavigation(() => router.push(rentHref(lang, { range: next, cart: [], focusModelId }), { scroll: false }))
  }

  function changeCart(next: CartItem[]) {
    setCart(next)
    setNotice(null)
  }

  // Somebody else booked or freed a bike: read the page again. The channel is public (anybody who knows its name could ping it), so each
  // visitor reads at most once every five seconds and never while the tab is hidden: on coming back the hook reads it once.
  const reload = useMemo(
    () => coalesce(() => { if (document.visibilityState === 'visible') router.refresh() }, 5000),
    [router],
  )
  useEffect(() => reload.cancel, [reload])
  useReservationsRealtime(reload)

  // New numbers from the server: what is no longer free leaves the cart, and the person is told. (Adjusted while rendering, not in an effect:
  // the cart is state derived from `models`, and React wants that settled before painting.)
  const [seenModels, setSeenModels] = useState(models)
  if (seenModels !== models) {
    setSeenModels(models)
    const next = sanitizeCart(cart, models)
    if (JSON.stringify(next) !== JSON.stringify(cart)) {
      setCart(next)
      setNotice(dict.cart_changed)
    }
  }

  // The cart is kept in the address (a link, Back and a reload keep it).
  useEffect(() => {
    window.history.replaceState(null, '', rentHref(lang, { range, cart, focusModelId }))
  }, [lang, range, cart, focusModelId])

  const days = range ? daysBetween(range.startsOn, range.endsOn) : 0
  const lines = cartLines(cart, models)
  const total = cartTotalCents(lines)
  // The models come in the order of the panel: the categories as ordered there, and inside each its models as ordered there (a model with
  // no bike free stays in its place, switched off).
  const shown = mode === 'bike' ? models.filter((model) => model.id === focus?.id) : models
  const sections: { id: string; name: string; models: BookableModel[] }[] = []
  for (const model of shown) {
    const section = sections.find((entry) => entry.id === model.categoryId)
      ?? sections[sections.push({ id: model.categoryId, name: model.categoryName, models: [] }) - 1]
    section.models.push(model)
  }
  const continueHref = checkoutHref(lang, { range, cart, focusModelId: null })
  const allHref = rentHref(lang, { range, cart: [], focusModelId: null })

  const count = totalBikes(cart)
  // The bar at the foot of a phone shows the total while the bikes are chosen, and gives way to the summary when it comes into view
  // (the margin counts the bar's height, so the summary is "in view" only once it is clear of it).
  const summaryRef = useRef<HTMLElement>(null)
  const [summaryInView, setSummaryInView] = useState(false)
  useEffect(() => {
    const element = summaryRef.current
    if (!element) return
    const observer = new IntersectionObserver(([entry]) => setSummaryInView(entry.isIntersecting), { rootMargin: '0px 0px -80px 0px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="space-y-6">
      <section className="mx-auto w-full max-w-3xl rounded-xl border bg-card p-4 shadow-sm sm:p-5" aria-labelledby="rent-when">
        <h2 id="rent-when" className="sr-only">{dict.dates_title}</h2>
        {mode === 'bike' && focus && (
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b pb-3">
            <p className="text-sm text-muted-foreground">
              {dict.bike_mode_label} <strong className="font-semibold text-foreground">{focus.name}</strong> · {focus.categoryName}
            </p>
            <Link href={allHref} className="text-sm font-medium text-primary hover:underline">
              {range ? dict.see_all_free : dict.see_all_bikes}
            </Link>
          </div>
        )}
        <PeriodPicker
          lang={lang} dict={dict} units={units} schedule={schedule} range={range} minDay={minDay} maxDay={maxDay}
          maxDays={MAX_RENTAL_DAYS} mode={mode} pending={navigating} onChange={changeDays}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <section className={cn('space-y-4 transition-opacity', navigating && 'opacity-60')} aria-labelledby="rent-which">
          <h2 id="rent-which" className="text-lg font-semibold text-foreground">{dict.bikes_title}</h2>
          {!range && <p className="text-sm text-muted-foreground">{dict.bikes_need_dates}</p>}
          {range && shown.length === 0 && <p className="text-sm text-muted-foreground">{dict.bikes_none}</p>}
          {notice && <p role="status" className="rounded-lg border bg-muted p-3 text-sm text-foreground">{notice}</p>}
          {range && sections.map((section) => (
            <div key={section.id} className="space-y-3">
              {mode === 'days' && <h3 className="text-base font-semibold text-foreground">{section.name}</h3>}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {section.models.map((model) => (
                  <ModelCard key={model.id} model={model} lang={lang} dict={dict} cart={cart} media={media[model.id]} onChange={changeCart} />
                ))}
              </div>
            </div>
          ))}
        </section>

        <aside ref={summaryRef} id="rent-summary-box" className="scroll-mt-24 space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5 lg:sticky lg:top-24" aria-labelledby="rent-summary">
          <h2 id="rent-summary" className="text-lg font-semibold text-foreground">{dict.summary_title}</h2>
          <p className="text-sm font-medium text-foreground">
            {range ? `${formatDays(range, lang)} · ${days === 1 ? dict.days_one : fill(dict.days_other, { n: days })}` : (
              <span className="font-normal text-muted-foreground">{dict.summary_no_dates}</span>
            )}
          </p>
          {lines.length === 0 ? (
            <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">{dict.summary_no_bikes}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {lines.map((line) => (
                <li key={`${line.bikeModelId}.${line.bikeSizeId}.${line.bikeVersionId}`} className="flex items-baseline justify-between gap-3">
                  <span className="text-foreground">
                    {line.quantity > 1 && <span className="tabular-nums">{line.quantity} × </span>}
                    {line.modelName} · {fill(dict.size_label, { size: line.sizeName })}
                    {line.versionName && ` · ${line.versionName}`}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{formatPrice(line.lineCents, lang)}</span>
                </li>
              ))}
            </ul>
          )}
          {lines.length > 0 && (
            <div className="flex items-baseline justify-between border-t pt-3">
              <span className="font-semibold text-foreground">{dict.total}</span>
              <span className="text-2xl font-bold tabular-nums text-primary">{formatPrice(total, lang)}</span>
            </div>
          )}
          {range && lines.length > 0 ? (
            <Button asChild size="lg" className="w-full"><Link href={continueHref}>{dict.continue}</Link></Button>
          ) : (
            <Button size="lg" className="w-full" disabled>{dict.continue}</Button>
          )}
        </aside>
      </div>

      {count > 0 && (
        <div className={cn(
          'fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-4 border-t bg-card px-4 py-3 shadow-lg transition-transform lg:hidden',
          summaryInView && 'translate-y-full',
        )}>
          <div className="leading-tight">
            <p className="text-xs text-muted-foreground">{count === 1 ? dict.bikes_one : fill(dict.bikes_other, { n: count })}</p>
            <p className="text-lg font-bold tabular-nums text-foreground">{formatPrice(total, lang)}</p>
          </div>
          <Button asChild><Link href={continueHref} tabIndex={summaryInView ? -1 : undefined}>{dict.continue}</Link></Button>
        </div>
      )}
    </div>
  )
}
