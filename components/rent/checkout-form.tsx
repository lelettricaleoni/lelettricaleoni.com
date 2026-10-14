'use client'

import { useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { startCheckoutAction, type StartCheckoutActionResult } from '@/lib/actions/rent'
import type { CartLine } from '@/lib/booking/cart'
import { fill, formatDays } from '@/lib/booking/format'
import { MAX_RENTAL_DAYS, type CartItem } from '@/lib/booking/rules'
import { daysBetween, inclusiveEnd, type DayRange } from '@/lib/dates'
import { formatPrice } from '@/lib/money'
import type { RentDict } from './rent-flow'

type Lang = 'it' | 'en' | 'de'

/**
 * The last step of a booking: what is being rented, when and where to pick it up and bring it back, the terms, and Pay, which opens the
 * payment page. The days and the bikes come from the address (the server has already checked them against what is free now); the
 * person is signed in (the page sends the others to sign in and back). Later this is where extras can be added to the booking.
 * What is shown is an estimate: the server prices, checks and holds the bikes when the person pays.
 */
export function CheckoutForm({
  lang, dict, termsHref, selfHref, editHref, range, cart, lines, total, pickup, needsPhone, changed, media,
}: {
  lang: Lang
  dict: RentDict
  termsHref: string
  /** This page's own address, where signing in brings the person back to. */
  selfHref: string
  /** The booking page with the same days and bikes, to change them. */
  editHref: string
  range: DayRange
  cart: CartItem[]
  lines: CartLine[]
  total: number
  pickup: string
  /** The profile has no phone yet: it is asked for here and saved there. */
  needsPhone: boolean
  /** What the address asked for is not all free any more: the bikes shown are the ones that are. */
  changed: boolean
  /** The photo of each model, by id (server components, so they cannot be made here). */
  media: Record<string, ReactNode>
}) {
  const router = useRouter()
  // The key of THIS booking: made when the page opens, so a second click, a reload or a second tab ask for the same one.
  const [bookingKey] = useState(() => crypto.randomUUID())
  const [phone, setPhone] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startPay] = useTransition()

  const days = daysBetween(range.startsOn, range.endsOn)
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
      if (result.status === 'login_required') { router.push(`/${lang}/login?next=${encodeURIComponent(selfHref)}`); return }
      const key = result.status === 'invalid' && result.reason === 'closed_day' ? 'closed_day'
        : result.status === 'invalid' && result.reason === 'too_long' ? 'stay_too_long'
        : result.status in dict.errors ? (result.status as keyof RentDict['errors']) : 'generic'
      setError(fill(dict.errors[key], { max: 'maxDays' in result ? result.maxDays : MAX_RENTAL_DAYS }))
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div className="space-y-6">
        <section className="space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5" aria-labelledby="checkout-rental">
          <div className="flex items-center justify-between gap-3">
            <h2 id="checkout-rental" className="text-lg font-semibold text-foreground">{dict.summary_title}</h2>
            <Button asChild variant="outline" size="sm"><Link href={editHref}>{dict.edit}</Link></Button>
          </div>
          <p className="text-sm font-medium text-foreground">
            {formatDays(range, lang, { weekday: true })} · {days === 1 ? dict.days_one : fill(dict.days_other, { n: days })}
          </p>
          {changed && <p role="status" className="rounded-lg border bg-muted p-3 text-sm text-foreground">{dict.cart_changed}</p>}
          <ul className="divide-y">
            {lines.map((line) => (
              <li key={`${line.bikeModelId}.${line.bikeSizeId}.${line.bikeVersionId}`} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="relative aspect-[3/2] w-20 shrink-0 overflow-hidden rounded-md border bg-white">{media[line.bikeModelId]}</div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">{line.modelName}</p>
                  <p className="text-sm text-muted-foreground">
                    {fill(dict.size_label, { size: line.sizeName })}
                    {line.versionName && ` · ${line.versionName}`}
                    {line.quantity > 1 && ` · ${line.quantity} × ${formatPrice(line.unitCents, lang)}`}
                  </p>
                </div>
                <span className="shrink-0 font-medium tabular-nums text-foreground">{formatPrice(line.lineCents, lang)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-2 rounded-xl border bg-card p-4 shadow-sm sm:p-5" aria-labelledby="checkout-pickup">
          <h2 id="checkout-pickup" className="text-lg font-semibold text-foreground">{dict.pickup_title}</h2>
          <p className="whitespace-pre-line text-sm text-foreground">{pickup}</p>
        </section>

        {needsPhone && (
          <section className="space-y-2 rounded-xl border bg-card p-4 shadow-sm sm:p-5" aria-labelledby="checkout-contact">
            <h2 id="checkout-contact" className="text-lg font-semibold text-foreground">{dict.contact_title}</h2>
            <Label htmlFor="rent-phone">{dict.phone_label}</Label>
            <Input id="rent-phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="+39" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} className="max-w-xs" />
            <p className="text-xs text-muted-foreground">{dict.phone_hint}</p>
          </section>
        )}
      </div>

      <aside className="space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5 lg:sticky lg:top-24" aria-label={dict.checkout_title}>
        <div className="flex items-baseline justify-between">
          <span className="font-semibold text-foreground">{dict.total}</span>
          <span className="text-2xl font-bold tabular-nums text-primary">{formatPrice(total, lang)}</span>
        </div>
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
        <p className="text-xs text-muted-foreground">
          {dict.invoice_note}{' '}
          <a href="tel:+393381232434" className="whitespace-nowrap font-medium text-primary hover:underline">+39 338 123 2434</a>
        </p>
      </aside>
    </div>
  )
}
