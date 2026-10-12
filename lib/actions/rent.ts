'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth/current-user'
import { languageOf } from '@/lib/auth/language'
import { buildRange } from '@/lib/dates'
import { cancelMyBike, payWithFakeCard, startCheckoutForUser } from '@/lib/booking/rent-actions'

/*
 * The booking actions the pages call. Thin on purpose (docs: Server Actions are public POST endpoints): the person comes from the SESSION
 * (`getCurrentUser`), never from the input; the input is validated; and what goes back to the browser is only what the page shows.
 * What a person may do, and with whose booking, is decided in lib/booking/rent-actions.ts and tested there.
 *
 * `redirect()` throws, so it is always called outside any try/catch.
 */

const startSchema = z.object({
  bookingKey: z.uuid(),
  from: z.string().max(10),
  to: z.string().max(10),
  // Parsed for real by the engine (`cartSchema`); only its being sent is checked here.
  cart: z.unknown(),
  lang: z.string().max(8),
  phone: z.string().max(40).optional(),
  phoneCountry: z.string().max(2).optional(),
  acceptTerms: z.boolean(),
})

export type StartCheckoutActionResult =
  | { status: 'invalid_request' | 'login_required' | 'not_allowed' | 'terms_required' | 'needs_phone' | 'invalid_phone' }
  | { status: 'invalid'; reason: string }
  | { status: 'unknown_bike' | 'bike_unavailable'; lineIndex: number }
  | { status: 'too_many_days'; lineIndex: number; maxDays: number }
  | { status: 'has_pending' | 'in_progress' | 'closed' | 'too_many_attempts' | 'try_again' | 'payments_unavailable' }

/** "Pay": to the payment page, or back with the reason in words the page can show. */
export async function startCheckoutAction(input: unknown): Promise<StartCheckoutActionResult> {
  const parsed = startSchema.safeParse(input)
  if (!parsed.success) return { status: 'invalid_request' }
  const { lang: rawLang, from, to, ...rest } = parsed.data
  const lang = languageOf(rawLang)

  const range = buildRange(from, to)
  if (!range.ok) return { status: 'invalid', reason: range.reason }

  const user = await getCurrentUser()
  if (!user) return { status: 'login_required' }

  const outcome = await startCheckoutForUser(user, {
    bookingKey: rest.bookingKey,
    range: { startsOn: range.startsOn, endsOn: range.endsOn },
    cart: rest.cart,
    phone: rest.phone,
    phoneCountry: rest.phoneCountry,
    acceptTerms: rest.acceptTerms,
    language: lang,
  })

  // `redirect` throws: nothing after it runs.
  if (outcome.status === 'redirect') redirect(outcome.url)
  if (outcome.status === 'already_paid') redirect(`/${lang}/account/rents/${outcome.bookingId}?paid=1`)

  switch (outcome.status) {
    case 'invalid': return { status: 'invalid', reason: outcome.reason }
    case 'unknown_bike': case 'bike_unavailable': return { status: outcome.status, lineIndex: outcome.lineIndex }
    case 'too_many_days': return { status: 'too_many_days', lineIndex: outcome.lineIndex, maxDays: outcome.maxDays }
    case 'has_pending': case 'in_progress': case 'closed': return { status: outcome.status }
    default: return { status: outcome.status }
  }
}

const idSchema = z.uuid()

export type CancelBikeActionResult =
  | { status: 'cancelled'; refundedCents: number; bookingCancelled: boolean }
  | { status: 'too_late'; deadline: string }
  | { status: 'invalid_request' | 'login_required' | 'not_found' | 'already_cancelled' | 'refund_failed' }

/** "Cancel this bike": refunded in full before the deadline; the page is refreshed in the same round trip. */
export async function cancelBikeAction(reservationId: unknown, lang: unknown): Promise<CancelBikeActionResult> {
  const id = idSchema.safeParse(reservationId)
  if (!id.success) return { status: 'invalid_request' }
  const user = await getCurrentUser()
  if (!user) return { status: 'login_required' }

  const result = await cancelMyBike(user, id.data)
  revalidatePath(`/${languageOf(lang)}/account/rents`, 'layout')

  switch (result.status) {
    case 'cancelled': return { status: 'cancelled', refundedCents: result.refundedCents, bookingCancelled: result.bookingCancelled }
    case 'too_late': return { status: 'too_late', deadline: result.deadline.toISOString() }
    case 'not_found': case 'already_cancelled': return { status: result.status }
    default: return { status: 'refund_failed' }
  }
}

export type FakePayActionResult = { status: 'invalid_request' | 'login_required' | 'not_found' | 'unavailable' | 'not_payable' }

/** The staging payment page's "Pay": there is no such thing in production (`payWithFakeCard` says "unavailable"). */
export async function payWithFakeCardAction(sessionId: unknown): Promise<FakePayActionResult> {
  const session = z.string().min(1).max(100).safeParse(sessionId)
  if (!session.success) return { status: 'invalid_request' }
  const user = await getCurrentUser()
  if (!user) return { status: 'login_required' }

  const result = await payWithFakeCard(user, session.data)
  if (result.status === 'paid') redirect(result.next)
  return { status: result.status }
}
