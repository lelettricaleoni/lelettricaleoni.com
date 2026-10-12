import type { User } from '@supabase/supabase-js'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { getCountries, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js'
import { db, bikeReservations, bikeUnits, customers, type Booking, type Customer } from '@/lib/db'
import { ensureCustomerFor } from '@/lib/auth/ensure-customer'
import { SITE_URL } from '@/lib/auth/urls'
import { languageOf } from '@/lib/auth/language'
import { DEFAULT_PHONE_COUNTRY } from '@/lib/customer'
import { todayInRome, type DayRange, type IsoDate } from '@/lib/dates'
import { beginCheckout, type BeginCheckoutResult } from './checkout'
import { confirmBooking } from './confirm'
import { findBooking } from './holds'
import { getFakeGateway, getPaymentGateway, PaymentsNotConfiguredError } from './payments'
import type { PaymentGateway } from './payments/gateway'
import { cancelOnlineReservation, type CancelOnlineResult } from './refunds'
import { rentHref, type RentState } from './rent-url'
import { settleHold } from './settle'

/*
 * What a signed-in person can do with a booking, written so the Server Actions are thin. EVERYTHING here takes the person from the
 * session (the `user` the caller has just read from it), never from a form: the customer is found by `user.id`, and a booking or a bike
 * that is not theirs is answered as "not found", exactly as one that does not exist — a stranger learns nothing, even with a real id.
 * An account of the shop is a person like any other here: its role gives it the panel, and takes nothing away from the public site.
 */

const COUNTRIES = new Set<string>(getCountries())

/** The customer of the person, or null: none yet. */
async function customerOf(user: User): Promise<Customer | null> {
  const [row] = await db.select().from(customers).where(eq(customers.userId, user.id))
  return row ?? null
}

async function ownBooking(user: User, bookingId: string): Promise<{ customer: Customer; booking: Booking } | null> {
  const customer = await customerOf(user)
  if (!customer) return null
  const booking = await findBooking(bookingId)
  return booking && booking.customerId === customer.id ? { customer, booking } : null
}

async function getGateway(gateway?: PaymentGateway): Promise<PaymentGateway | null> {
  try {
    return gateway ?? getPaymentGateway()
  } catch (error) {
    if (error instanceof PaymentsNotConfiguredError) return null
    throw error
  }
}

export interface StartCheckoutRequest {
  /** The idempotency key of the booking, made when the summary was opened. */
  bookingKey: string
  range: DayRange
  /** Not trusted: `beginCheckout` parses it. */
  cart: unknown
  /** Asked for only when the profile has no phone; never replaces the one it has. */
  phone?: string | null
  phoneCountry?: string | null
  acceptTerms: boolean
  /** The language of the page: anything that is not one of the three is Italian (it ends up in addresses). */
  language: string
}

export type StartCheckoutOutcome =
  | BeginCheckoutResult
  | { status: 'not_allowed' | 'terms_required' | 'needs_phone' | 'invalid_phone' }

/**
 * From "Pay" on the summary to the payment page. The person must be a confirmed customer who accepted the terms and has a
 * phone: the one in the profile, or the one given now, which is checked and saved in the profile.
 */
export async function startCheckoutForUser(
  user: User, request: StartCheckoutRequest, gateway?: PaymentGateway,
  /** For tests only: what day it is. The real one is Rome's today, and no request can say another. */
  options: { today?: IsoDate } = {},
): Promise<StartCheckoutOutcome> {
  if (!user.email || !user.email_confirmed_at) return { status: 'not_allowed' }
  if (!request.acceptTerms) return { status: 'terms_required' }
  const language = languageOf(request.language)

  await ensureCustomerFor(user, { language })
  const customer = await customerOf(user)
  if (!customer) return { status: 'not_allowed' }

  if (!customer.phone) {
    const raw = request.phone?.trim()
    if (!raw) return { status: 'needs_phone' }
    const country = (request.phoneCountry && COUNTRIES.has(request.phoneCountry) ? request.phoneCountry : DEFAULT_PHONE_COUNTRY) as CountryCode
    const parsed = parsePhoneNumberFromString(raw, country)
    if (!parsed?.isValid()) return { status: 'invalid_phone' }
    // Only where the profile still has none: another request may have filled it, and that one stays.
    await db.update(customers).set({ phone: parsed.number, updatedAt: new Date() })
      .where(and(eq(customers.id, customer.id), isNull(customers.phone)))
  }

  return beginCheckout({
    bookingKey: request.bookingKey,
    customerId: customer.id,
    customerEmail: user.email,
    language,
    startsOn: request.range.startsOn,
    endsOn: request.range.endsOn,
    cart: request.cart,
    today: options.today ?? todayInRome(),
    urls: (bookingId) => ({
      successUrl: `${SITE_URL}/${language}/account/rents/${bookingId}?paid=1`,
      cancelUrl: `${SITE_URL}/${language}/rent/cancelled/${bookingId}`,
    }),
  }, gateway)
}

export type CancelMyBikeResult = CancelOnlineResult

/** The customer cancels one bike of theirs: refunded in full before the deadline (`cancelOnlineReservation` decides). */
export async function cancelMyBike(user: User, reservationId: string, gateway?: PaymentGateway, now?: Date): Promise<CancelMyBikeResult> {
  const customer = await customerOf(user)
  if (!customer) return { status: 'not_found' }
  const payments = await getGateway(gateway)
  if (!payments) return { status: 'refund_failed', reason: 'payments_unavailable' }
  return cancelOnlineReservation({ reservationId, actor: { kind: 'customer', customerId: customer.id, userId: user.id }, now }, payments)
}

export type ConfirmMyBookingResult =
  | { status: 'confirmed' | 'not_paid' | 'refunded' | 'in_progress' | 'closed' | 'not_found' }

/**
 * The page the person lands on after paying: if the webhook has not confirmed the booking yet, this does, now (the same idempotent
 * function). Only for a booking of theirs.
 */
export async function confirmMyBooking(user: User, bookingId: string, gateway?: PaymentGateway): Promise<ConfirmMyBookingResult> {
  const own = await ownBooking(user, bookingId)
  if (!own) return { status: 'not_found' }
  const payments = await getGateway(gateway)
  if (!payments) return { status: 'closed' }
  const result = await confirmBooking(bookingId, payments)
  switch (result.status) {
    case 'confirmed': case 'already_confirmed': case 'reassigned': return { status: 'confirmed' }
    case 'not_paid': return { status: 'not_paid' }
    case 'refunded': case 'refund_failed': return { status: 'refunded' }
    case 'incomplete': return { status: 'in_progress' }
    default: return { status: 'closed' }
  }
}

export type AbandonMyCheckoutResult =
  | { status: 'abandoned'; href: string }
  | { status: 'paid' | 'not_found' }

/**
 * The person went back from the payment page. The session is closed on the gateway FIRST and only then are the bikes freed (`settleHold`:
 * a click on "back" must not leave the session payable from another tab), at once and not after the thirty minutes. If they had
 * already paid, the booking is confirmed instead. The cart comes back, as it was, in the address of the booking page.
 */
export async function abandonMyCheckout(user: User, bookingId: string, lang: string, gateway?: PaymentGateway): Promise<AbandonMyCheckoutResult> {
  const own = await ownBooking(user, bookingId)
  if (!own) return { status: 'not_found' }
  const payments = await getGateway(gateway)
  if (payments && own.booking.status === 'pending') await settleHold(bookingId, payments)
  const after = await findBooking(bookingId)
  if (after?.status === 'confirmed') return { status: 'paid' }
  return { status: 'abandoned', href: rentHref(languageOf(lang), await stateOfBooking(own.booking)) }
}

/** The booking page's state that made this booking: its days and its bikes (the first ones made, whatever happened to them since). */
async function stateOfBooking(booking: Booking): Promise<RentState> {
  const lines = await db
    .select({ modelId: bikeUnits.bikeModelId, sizeId: bikeUnits.bikeSizeId, versionId: bikeUnits.bikeVersionId })
    .from(bikeReservations)
    .innerJoin(bikeUnits, eq(bikeUnits.id, bikeReservations.bikeUnitId))
    .where(eq(bikeReservations.bookingId, booking.id))
    .orderBy(asc(bikeReservations.createdAt), asc(bikeReservations.id))
    .limit(booking.lineCount)
  const cart: RentState['cart'] = []
  for (const line of lines) {
    const same = cart.find((item) => item.bikeModelId === line.modelId && item.bikeSizeId === line.sizeId && item.bikeVersionId === line.versionId)
    if (same) same.quantity += 1
    else cart.push({ bikeModelId: line.modelId, bikeSizeId: line.sizeId, bikeVersionId: line.versionId, quantity: 1 })
  }
  return { range: { startsOn: booking.startsOn, endsOn: booking.endsOn }, cart, focusModelId: null }
}

export type FakePayResult = { status: 'paid'; next: string } | { status: 'not_found' | 'unavailable' | 'not_payable' }

/**
 * What the staging payment page does instead of a card form: pays the session of the person's own booking, and says where they go next
 * (a path of this site). Where there is no fake gateway (production) it says "unavailable" and nothing else, so nothing is paid there.
 */
export async function payWithFakeCard(user: User, sessionId: string): Promise<FakePayResult> {
  let fake
  try {
    fake = getFakeGateway()
  } catch (error) {
    if (error instanceof PaymentsNotConfiguredError) return { status: 'unavailable' }
    throw error
  }
  const session = fake.describe(sessionId)
  if (!session || !(await ownBooking(user, session.bookingId))) return { status: 'not_found' }
  if (!fake.pay(sessionId)) return { status: 'not_payable' }
  const next = new URL(session.successUrl)
  return { status: 'paid', next: `${next.pathname}${next.search}` }
}
