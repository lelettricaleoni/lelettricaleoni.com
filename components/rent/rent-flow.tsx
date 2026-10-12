'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { DateRange } from 'react-day-picker'
import { de as dpDe, enGB as dpEn, it as dpIt } from 'react-day-picker/locale'
import { LuMinus, LuPlus } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { startCheckoutAction, type StartCheckoutActionResult } from '@/lib/actions/rent'
import { cartLines, cartTotalCents, quantityOf, sanitizeCart, totalBikes, withQuantity } from '@/lib/booking/cart'
import type { BookableModel } from '@/lib/booking/catalog'
import { fill, formatDays } from '@/lib/booking/format'
import { rentHref } from '@/lib/booking/rent-url'
import { MAX_BIKES_PER_BOOKING, type BikeSpec, type CartItem } from '@/lib/booking/rules'
import { daysBetween, dayToDate, exclusiveEnd, inclusiveEnd, isoDay, type DayRange, type IsoDate } from '@/lib/dates'
import { formatPrice } from '@/lib/money'
import { cn } from '@/lib/utils'
import type itMessages from '@/messages/it.json'

type Lang = 'it' | 'en' | 'de'
export type RentDict = (typeof itMessages)['rent']

export type RentAccount = { kind: 'guest' } | { kind: 'customer'; hasPhone: boolean }

const CALENDAR_LOCALE = { it: dpIt, en: dpEn, de: dpDe } as const

/**
 * The booking page: when, which bikes, and the summary with the payment. The days live in the ADDRESS and change it through the router
 * (the server then counts the bikes free for them); the cart lives here and is copied into the address as it changes, without leaving
 * the page, so Back works and a link can be shared. Remounted by the page whenever the days change (`key`), which clears the cart.
 *
 * What is shown is an estimate: the server prices, checks and holds when the person pays.
 */
export function RentFlow({
  lang, dict, termsHref, range, initialCart, focusModelId, models, minDay, maxDay, account,
}: {
  lang: Lang
  dict: RentDict
  termsHref: string
  range: DayRange | null
  initialCart: CartItem[]
  focusModelId: string | null
  models: BookableModel[]
  minDay: IsoDate
  maxDay: IsoDate
  account: RentAccount
}) {
  const router = useRouter()
  const [navigating, startNavigation] = useTransition()
  const [cart, setCart] = useState<CartItem[]>(() => sanitizeCart(initialCart, models))
  const [draft, setDraft] = useState<DateRange | undefined>(
    range ? { from: dayToDate(range.startsOn), to: dayToDate(inclusiveEnd(range.endsOn)) } : undefined,
  )
  const wide = useWideScreen()

  function changeDays(next: DateRange | undefined) {
    setDraft(next)
    // Two different days chosen: the stay is complete. One day only is a stay too, once the person taps it again (or the range closes on it).
    if (next?.from && next.to) {
      const startsOn = isoDay(next.from)
      const endsOn = exclusiveEnd(isoDay(next.to))
      startNavigation(() => router.push(rentHref(lang, { range: { startsOn, endsOn }, cart: [], focusModelId }), { scroll: false }))
    }
  }

  function changeCart(next: CartItem[]) {
    setCart(next)
    // Same page, new address: the cart is kept in it. (Native History API: Next.js syncs it with `useSearchParams`.)
    window.history.replaceState(null, '', rentHref(lang, { range, cart: next, focusModelId }))
  }

  const days = range ? daysBetween(range.startsOn, range.endsOn) : 0
  const lines = cartLines(cart, models)
  const total = cartTotalCents(lines)
  const ordered = [...models].sort((a, b) => Number(b.id === focusModelId) - Number(a.id === focusModelId))
  const currentHref = rentHref(lang, { range, cart, focusModelId: null })

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div className="space-y-6">
        <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-6" aria-labelledby="rent-when">
          <h2 id="rent-when" className="text-lg font-semibold text-foreground">{dict.dates_title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{dict.dates_hint}</p>
          <div className="mt-4 overflow-x-auto">
            <Calendar
              mode="range"
              selected={draft}
              onSelect={changeDays}
              numberOfMonths={wide ? 2 : 1}
              locale={CALENDAR_LOCALE[lang]}
              defaultMonth={draft?.from ?? dayToDate(minDay)}
              startMonth={dayToDate(minDay)}
              endMonth={dayToDate(maxDay)}
              disabled={{ before: dayToDate(minDay), after: dayToDate(maxDay) }}
              className="mx-auto rounded-md border"
            />
          </div>
          <p className="mt-3 text-sm" aria-live="polite">
            {range ? (
              <span className="font-medium text-foreground">
                {formatDays(range, lang)} · {days === 1 ? dict.days_one : fill(dict.days_other, { n: days })}
              </span>
            ) : (
              <span className="text-muted-foreground">{dict.dates_prompt}</span>
            )}
          </p>
        </section>

        <section className={cn('rounded-xl border bg-card p-4 shadow-sm transition-opacity sm:p-6', navigating && 'opacity-60')} aria-labelledby="rent-which">
          <h2 id="rent-which" className="text-lg font-semibold text-foreground">{dict.bikes_title}</h2>
          {!range && <p className="mt-2 text-sm text-muted-foreground">{dict.bikes_need_dates}</p>}
          {range && ordered.length === 0 && <p className="mt-2 text-sm text-muted-foreground">{dict.bikes_none}</p>}
          {range && ordered.length > 0 && (
            <div className="mt-4 space-y-4">
              {ordered.map((model) => (
                <ModelCard key={model.id} model={model} lang={lang} dict={dict} cart={cart} onChange={changeCart} />
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
        {range && lines.length > 0 && (
          <PaySection lang={lang} dict={dict} termsHref={termsHref} account={account} range={range} cart={cart} total={total} loginHref={`/${lang}/login?next=${encodeURIComponent(currentHref)}`} />
        )}
      </aside>
    </div>
  )
}

/** A model: its name, the price of the stay for one bike, and a row with a counter for every size (and version) that has a bike free. */
function ModelCard({
  model, lang, dict, cart, onChange,
}: { model: BookableModel; lang: Lang; dict: RentDict; cart: CartItem[]; onChange: (next: CartItem[]) => void }) {
  const [, priceTail] = dict.price_each.split('{price}')
  return (
    <article className="rounded-xl border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-semibold text-foreground">{model.name}</h3>
        {model.stayPriceCents !== null && (
          <p className="text-sm text-muted-foreground">
            <strong className="font-semibold text-primary">{formatPrice(model.stayPriceCents, lang)}</strong>
            {fill(priceTail, { days: model.days === 1 ? dict.days_one : fill(dict.days_other, { n: model.days }) })}
          </p>
        )}
      </div>
      {model.tooLong ? (
        <p className="mt-2 text-sm text-muted-foreground">{fill(dict.too_long, { max: model.maxDays })}</p>
      ) : (
        <ul className="mt-2 divide-y">
          {model.variants.flatMap((variant) =>
            variant.versions.map((version) => {
              const spec: BikeSpec = { bikeModelId: model.id, bikeSizeId: variant.sizeId, bikeVersionId: version.versionId }
              const quantity = quantityOf(cart, spec)
              const full = totalBikes(cart) >= MAX_BIKES_PER_BOOKING
              return (
                <li key={`${variant.sizeId}.${version.versionId}`} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {fill(dict.size_label, { size: variant.sizeName })}
                      {variant.chooseVersion && ` · ${version.versionName}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {version.free === 1 ? dict.free_one : fill(dict.free_other, { n: version.free })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button" variant="outline" size="icon" className="size-9" aria-label={dict.fewer}
                      disabled={quantity === 0} onClick={() => onChange(withQuantity(cart, spec, quantity - 1, version.free))}
                    >
                      <LuMinus />
                    </Button>
                    <span className="w-6 text-center text-sm font-semibold tabular-nums" aria-live="polite">{quantity}</span>
                    <Button
                      type="button" variant="outline" size="icon" className="size-9" aria-label={dict.more}
                      disabled={quantity >= version.free || full} onClick={() => onChange(withQuantity(cart, spec, quantity + 1, version.free))}
                    >
                      <LuPlus />
                    </Button>
                  </div>
                </li>
              )
            }),
          )}
        </ul>
      )}
    </article>
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

/** Two months side by side only where there is room; one month on a phone. Starts at one so the server and the first paint agree. */
function useWideScreen() {
  const [wide, setWide] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)')
    const update = () => setWide(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return wide
}
