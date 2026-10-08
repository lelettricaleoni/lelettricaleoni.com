import { and, eq } from 'drizzle-orm'
import { db, bookings } from '@/lib/db'
import type { IsoDate } from '@/lib/dates'
import { expireBooking, findBooking, startHold, type StartHoldResult } from './holds'
import { getPaymentGateway, PaymentsNotConfiguredError } from './payments'
import type { PaymentGateway } from './payments/gateway'
import { quoteBikes } from './quote'
import { cartSchema, checkStay, expandCart } from './rules'
import { settleHold } from './settle'

export interface BeginCheckoutInput {
  /** The idempotency key of the whole booking, made when the person opened the page. */
  bookingKey: string
  customerId: string
  customerEmail: string
  language: string
  startsOn: IsoDate
  endsOn: IsoDate
  /** Not trusted: parsed here. */
  cart: unknown
  /** Today in Rome, passed in so the rules are testable. */
  today: IsoDate
  /** Where the payment page sends the person back to; the booking id is known only here. */
  urls: (bookingId: string) => { successUrl: string; cancelUrl: string }
}

export type BeginCheckoutResult =
  | { status: 'redirect'; bookingId: string; url: string; holdExpiresAt: Date }
  | { status: 'already_paid'; bookingId: string }
  | { status: 'invalid'; reason: 'cart' | 'invalid_date' | 'not_a_range' | 'too_soon' | 'too_far' }
  | { status: 'unknown_bike' | 'bike_unavailable'; lineIndex: number }
  | { status: 'too_many_days'; lineIndex: number; maxDays: number }
  | { status: 'has_pending'; bookingId: string }
  | { status: 'in_progress'; bookingId: string }
  | { status: 'closed'; bookingId: string; bookingStatus: string }
  | { status: 'too_many_attempts' }
  | { status: 'try_again' }
  | { status: 'payments_unavailable' }

/**
 * From "pay" to the payment page: check the request, price it on the server, hold the bikes, open a payment session and say where to
 * send the person. Everything is decided here, on the server, from the request and the catalogue; the browser only chose what to ask for.
 * If anything fails after the bikes are held they are freed; if the person already has another payment open, it is ended first (the
 * session closed, or confirmed if it was paid) so they are never stuck behind their own earlier attempt.
 */
export async function beginCheckout(input: BeginCheckoutInput, gateway?: PaymentGateway): Promise<BeginCheckoutResult> {
  const cart = cartSchema.safeParse(input.cart)
  if (!cart.success) return { status: 'invalid', reason: 'cart' }
  const stay = checkStay(input.startsOn, input.endsOn, input.today)
  if (!stay.ok) return { status: 'invalid', reason: stay.reason }

  // Before any bike is held: without a way to pay there is nothing to hold them for.
  let payments: PaymentGateway
  try {
    payments = gateway ?? getPaymentGateway()
  } catch (error) {
    if (error instanceof PaymentsNotConfiguredError) return { status: 'payments_unavailable' }
    throw error
  }

  const quote = await quoteBikes(expandCart(cart.data), stay.days, { language: input.language })
  if (quote.status !== 'ok') return quote

  const hold = await holdLinesOf(input, quote.lines, payments)
  if (hold.status === 'unavailable') return { status: 'bike_unavailable', lineIndex: hold.lineIndex }
  if (hold.status === 'try_again') return { status: 'try_again' }
  if (hold.status !== 'held') return hold

  // The same key again: the booking already exists, and so may its payment session.
  const existing = await findBooking(hold.bookingId)
  if (existing?.stripeSessionId) {
    const session = await payments.getSession(existing.stripeSessionId)
    if (session.status === 'open') return { status: 'redirect', bookingId: hold.bookingId, url: session.url, holdExpiresAt: hold.holdExpiresAt }
    if (session.status === 'paid') return { status: 'already_paid', bookingId: hold.bookingId }
    return { status: 'closed', bookingId: hold.bookingId, bookingStatus: existing.status }
  }

  let session
  try {
    session = await payments.createSession({
      bookingId: hold.bookingId,
      bookingKey: input.bookingKey,
      customerEmail: input.customerEmail,
      language: input.language,
      lines: quote.lines.map((line) => ({ label: line.label, amountCents: line.amountCents })),
      expiresAt: hold.holdExpiresAt,
      ...input.urls(hold.bookingId),
    })
  } catch (error) {
    await expireBooking(hold.bookingId)
    throw error
  }

  const saved = await db.update(bookings).set({ stripeSessionId: session.id })
    .where(and(eq(bookings.id, hold.bookingId), eq(bookings.status, 'pending'))).returning({ id: bookings.id })
  if (saved.length === 0) {
    // Somebody ended this booking while the session was being opened (the customer started another one): do not leave it payable.
    await payments.expireSession(session.id)
    const now = await findBooking(hold.bookingId)
    return { status: 'closed', bookingId: hold.bookingId, bookingStatus: now?.status ?? 'expired' }
  }
  return { status: 'redirect', bookingId: hold.bookingId, url: session.url, holdExpiresAt: hold.holdExpiresAt }
}

type HoldResult = StartHoldResult | { status: 'unavailable'; lineIndex: number }

/** Holds the bikes; if the customer has another payment open, ends it (once) and tries again. */
async function holdLinesOf(
  input: BeginCheckoutInput, lines: { bikeModelId: string; bikeSizeId: string; bikeVersionId: string; amountCents: number }[],
  payments: PaymentGateway,
): Promise<HoldResult> {
  const hold = () => startHold({
    bookingKey: input.bookingKey, customerId: input.customerId, startsOn: input.startsOn, endsOn: input.endsOn,
    language: input.language, lines,
  })
  const first = await hold()
  if (first.status !== 'has_pending') return first
  await settleHold(first.bookingId, payments)
  return hold()
}
