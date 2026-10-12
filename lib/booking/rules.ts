import { z } from 'zod'
import { addDaysTo, daysBetween, inclusiveEnd, isValidDay, type IsoDate } from '@/lib/dates'

/**
 * How long the bikes of a booking are kept while the person pays. Fifteen minutes is plenty to type a card (and a 3-D Secure check), and a
 * shop with few bikes cannot leave them blocked for longer by somebody who never came back. Stripe's own minimum for a Checkout session is
 * 30 minutes, which is no obstacle: the session is opened for 31 and `settleHold` closes it when OUR time is up (lib/booking/payments/stripe.ts),
 * so nobody can pay after the bikes were given up, and a payment that lands in the very last moment is confirmed or refunded (lib/booking/settle.ts).
 */
export const HOLD_MINUTES = 15
export const MAX_BIKES_PER_BOOKING = 10
/** The last day of a stay may be at most this many days from today. Only for the public page: the panel has no limit. */
export const MAX_DAYS_AHEAD = 180
/** A customer who has let this many bookings lapse in the last hour waits before starting another. */
export const ABANDONED_LIMIT = 5

export type StayCheck =
  | { ok: true; days: number }
  | { ok: false; reason: 'invalid_date' | 'not_a_range' | 'too_soon' | 'too_far' | 'closed_day' }

/**
 * Whether the days of an online booking are acceptable, and how many there are. `endsOn` is exclusive, as in the database.
 * Online you book from tomorrow: today's rentals are made at the counter. The category's own limit (`maxRentalDays`) is
 * checked when the price is asked (lib/booking/pricing.ts), because it belongs to each bike.
 */
export function checkStay(
  startsOn: string, endsOn: string, today: IsoDate,
  /** The days the shop is closed: a stay may not start or end on one (it may go through one: the bike stays with the customer). */
  options: { isClosed?: (day: IsoDate) => boolean } = {},
): StayCheck {
  if (!isValidDay(startsOn) || !isValidDay(endsOn)) return { ok: false, reason: 'invalid_date' }
  const days = daysBetween(startsOn, endsOn)
  if (days < 1) return { ok: false, reason: 'not_a_range' }
  if (daysBetween(today, startsOn) < 1) return { ok: false, reason: 'too_soon' }
  if (daysBetween(addDaysTo(today, MAX_DAYS_AHEAD), inclusiveEnd(endsOn)) > 0) return { ok: false, reason: 'too_far' }
  // The bike is picked up in the shop on the first day and brought back to it on the last.
  if (options.isClosed?.(startsOn) || options.isClosed?.(inclusiveEnd(endsOn))) return { ok: false, reason: 'closed_day' }
  return { ok: true, days }
}

export const bikeSpecSchema = z.object({
  bikeModelId: z.uuid(),
  bikeSizeId: z.uuid(),
  bikeVersionId: z.uuid(),
})

export const cartItemSchema = bikeSpecSchema.extend({
  quantity: z.number().int().min(1).max(MAX_BIKES_PER_BOOKING),
})

/** A cart: one to ten bikes in total, each entry a model, a size and a version with a quantity. */
export const cartSchema = z.array(cartItemSchema).min(1).refine(
  (items) => items.reduce((sum, item) => sum + item.quantity, 0) <= MAX_BIKES_PER_BOOKING,
  { message: `at most ${MAX_BIKES_PER_BOOKING} bikes in a booking` },
)

export type BikeSpec = z.infer<typeof bikeSpecSchema>
export type CartItem = z.infer<typeof cartItemSchema>

/** One entry per bike, in the order of the cart: what is held, one bike at a time. */
export function expandCart(items: CartItem[]): BikeSpec[] {
  return items.flatMap(({ quantity, ...spec }) => Array.from({ length: quantity }, () => ({ ...spec })))
}
