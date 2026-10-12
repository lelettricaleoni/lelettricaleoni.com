'use client'

import { useEffect, useMemo, useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { startCheckoutAction, type StartCheckoutActionResult } from '@/lib/actions/rent'
import { useReservationsRealtime } from '@/components/use-reservations-realtime'
import { cartLines, cartTotalCents, sanitizeCart } from '@/lib/booking/cart'
import type { BookableModel, FocusModel } from '@/lib/booking/catalog'
import type { UnitBusy } from '@/lib/booking/day-availability'
import { fill, formatDays } from '@/lib/booking/format'
import { rentHref } from '@/lib/booking/rent-url'
import type { CartItem } from '@/lib/booking/rules'
import { coalesce } from '@/lib/coalesce'
import { daysBetween, inclusiveEnd, type DayRange, type IsoDate } from '@/lib/dates'
import { formatPrice } from '@/lib/money'
import { cn } from '@/lib/utils'
import { ModelCard } from './model-card'
import { PeriodPicker } from './period-picker'
import type itMessages from '@/messages/it.json'

type Lang = 'it' | 'en' | 'de'
export type RentDict = (typeof itMessages)['rent']

export type RentAccount = { kind: 'guest' } | { kind: 'customer'; hasPhone: boolean }

/**
 * The booking page: when, which bikes, and the summary with the payment. The days live in the ADDRESS and change it through the router
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
  lang, dict, termsHref, range, initialCart, focusModelId, mode, focus, units, models, media, minDay, maxDay, account,
}: {
  lang: Lang
  dict: RentDict
  termsHref: string
  range: DayRange | null
  initialCart: CartItem[]
  focusModelId: string | null
  mode: 'days' | 'bike'
  focus: FocusModel | null
  units: UnitBusy[]
  models: BookableModel[]
  /** The photo of each model, by id (server components, so they cannot be made here). */
  media: Record<string, ReactNode>
  minDay: IsoDate
  maxDay: IsoDate
  account: RentAccount
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

  // Somebody else booked or freed a bike: read the page again (at most every two seconds: the channel is public).
  const reload = useMemo(() => coalesce(() => router.refresh(), 2000), [router])
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
  const shown = (mode === 'bike' ? models.filter((model) => model.id === focus?.id) : [...models])
    // The models with a bike free first, the switched-off ones after.
    .sort((a, b) => Number(b.totalFree > 0) - Number(a.totalFree > 0))
  const currentHref = rentHref(lang, { range, cart, focusModelId: null })
  const allHref = rentHref(lang, { range, cart: [], focusModelId: null })

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div className="space-y-6">
        <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-6" aria-labelledby="rent-when">
          {mode === 'bike' && focus && (
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b pb-4">
              <p className="text-sm text-muted-foreground">
                {dict.bike_mode_label} <strong className="font-semibold text-foreground">{focus.name}</strong> · {focus.categoryName}
              </p>
              <Link href={allHref} className="text-sm font-medium text-primary hover:underline">
                {range ? dict.see_all_free : dict.see_all_bikes}
              </Link>
            </div>
          )}
          <h2 id="rent-when" className="text-lg font-semibold text-foreground">{dict.dates_title}</h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">{dict.dates_hint}</p>
          <PeriodPicker
            lang={lang} dict={dict} units={units} range={range} minDay={minDay} maxDay={maxDay}
            maxDays={mode === 'bike' ? (focus?.maxDays ?? null) : null} mode={mode} pending={navigating} onChange={changeDays}
          />
        </section>

        <section className={cn('rounded-xl border bg-card p-4 shadow-sm transition-opacity sm:p-6', navigating && 'opacity-60')} aria-labelledby="rent-which">
          <h2 id="rent-which" className="text-lg font-semibold text-foreground">{dict.bikes_title}</h2>
          {!range && <p className="mt-2 text-sm text-muted-foreground">{dict.bikes_need_dates}</p>}
          {range && shown.length === 0 && <p className="mt-2 text-sm text-muted-foreground">{dict.bikes_none}</p>}
          {notice && <p role="status" className="mt-3 rounded-lg border bg-muted p-3 text-sm text-foreground">{notice}</p>}
          {range && shown.length > 0 && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {shown.map((model) => (
                <ModelCard key={model.id} model={model} lang={lang} dict={dict} cart={cart} media={media[model.id]} onChange={changeCart} />
              ))}
            </div>
          )}
        </section>
      </div>

      <aside className="space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-6 lg:sticky lg:top-24" aria-labelledby="rent-summary">
        <h2 id="rent-summary" className="text-lg font-semibold text-foreground">{dict.summary_title}</h2>
        <p className="text-sm text-foreground">
          {range ? `${formatDays(range, lang)} · ${days === 1 ? dict.days_one : fill(dict.days_other, { n: days })}` : (
            <span className="text-muted-foreground">{dict.summary_no_dates}</span>
          )}
        </p>
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">{dict.summary_no_bikes}</p>
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
            <span className="text-xl font-bold tabular-nums text-primary">{formatPrice(total, lang)}</span>
          </div>
        )}
        <p className="text-xs text-muted-foreground">{dict.pickup_note}</p>
        <p className="text-xs text-muted-foreground">
          {dict.invoice_note}{' '}
          <a href="tel:+393381232434" className="font-medium text-primary hover:underline">+39 338 123 2434</a>
          {' · '}
          <a href="mailto:info@lelettricaleoni.com" className="font-medium text-primary hover:underline">info@lelettricaleoni.com</a>
        </p>
        {range && lines.length > 0 && (
          <PaySection lang={lang} dict={dict} termsHref={termsHref} account={account} range={range} cart={cart} total={total} loginHref={`/${lang}/login?next=${encodeURIComponent(currentHref)}`} />
        )}
      </aside>
    </div>
  )
}

/** The end of the summary: sign in, or (phone), the terms and Pay. */
function PaySection({
  lang, dict, termsHref, account, range, cart, total, loginHref,
}: {
  lang: Lang; dict: RentDict; termsHref: string; account: RentAccount; range: DayRange; cart: CartItem[]; total: number; loginHref: string
}) {
  const router = useRouter()
  // The key of THIS booking: made when the summary opens, so a second click, a reload or a second tab ask for the same one.
  const [bookingKey] = useState(() => crypto.randomUUID())
  const [phone, setPhone] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startPay] = useTransition()

  if (account.kind === 'guest') {
    return (
      <div className="space-y-2">
        <Button asChild className="w-full"><Link href={loginHref}>{dict.login_cta}</Link></Button>
        <p className="text-xs text-muted-foreground">{dict.login_hint}</p>
      </div>
    )
  }

  const needsPhone = !account.hasPhone
  const ready = accepted && (!needsPhone || phone.trim().length > 0)
  const [termsBefore, termsAfter] = dict.terms_label.split('{link}')

  function pay() {
    setError(null)
    startPay(async () => {
      const result: StartCheckoutActionResult = await startCheckoutAction({
        bookingKey,
        from: range.startsOn,
        to: inclusiveEnd(range.endsOn),
        cart,
        lang,
        phone: needsPhone ? phone : undefined,
        phoneCountry: 'IT',
        acceptTerms: accepted,
      })
      // Reaching this line means it did not redirect to the payment page: there is something to say.
      if (result.status === 'login_required') { router.push(`/${lang}/login?next=${encodeURIComponent(rentHref(lang, { range, cart, focusModelId: null }))}`); return }
      const key = result.status in dict.errors ? (result.status as keyof RentDict['errors']) : 'generic'
      setError(fill(dict.errors[key], { max: 'maxDays' in result ? result.maxDays : '' }))
    })
  }

  return (
    <div className="space-y-4">
      {needsPhone && (
        <div className="space-y-1.5">
          <Label htmlFor="rent-phone">{dict.phone_label}</Label>
          <Input id="rent-phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="+39" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} />
          <p className="text-xs text-muted-foreground">{dict.phone_hint}</p>
        </div>
      )}
      <div className="flex items-start gap-2">
        <Checkbox id="rent-terms" checked={accepted} onCheckedChange={(value) => setAccepted(value === true)} className="mt-0.5" />
        <Label htmlFor="rent-terms" className="text-sm font-normal leading-snug">
          {termsBefore}
          <Link href={termsHref} target="_blank" className="font-medium text-primary underline-offset-2 hover:underline">{dict.terms_link}</Link>
          {termsAfter}
        </Label>
      </div>
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <Button type="button" className="w-full" size="lg" disabled={!ready || pending} onClick={pay}>
        {pending ? dict.paying : fill(dict.pay, { total: formatPrice(total, lang) })}
      </Button>
      <p className="text-xs text-muted-foreground">{dict.hold_note}</p>
    </div>
  )
}
