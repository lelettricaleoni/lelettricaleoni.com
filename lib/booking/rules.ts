import { z } from 'zod'
import { addDaysTo, daysBetween, inclusiveEnd, isValidDay, type IsoDate } from '@/lib/dates'

/** How long the bikes of a booking are kept while the person pays: the minimum of a Stripe Checkout session. */
export const HOLD_MINUTES = 30
export const MAX_BIKES_PER_BOOKING = 10
/** The last day of a stay may be at most this many days from today. Only for the public page: the panel has no limit. */
export const MAX_DAYS_AHEAD = 180
/** A customer who has let this many bookings lapse in the last hour waits before starting another. */
export const ABANDONED_LIMIT = 5

export type StayCheck =
  | { ok: true; days: number }
  | { ok: false; reason: 'invalid_date' | 'not_a_range' | 'too_soon' | 'too_far' }

/**
 * Whether the days of an online booking are acceptable, and how many there are. `endsOn` is exclusive, as in the database.
 * Online you book from tomorrow: today's rentals are made at the counter. The category's own limit (`maxRentalDays`) is
 * checked when the price is asked (lib/booking/pricing.ts), because it belongs to each bike.
 */
export function checkStay(startsOn: string, endsOn: string, today: IsoDate): StayCheck {
  if (!isValidDay(startsOn) || !isValidDay(endsOn)) return { ok: false, reason: 'invalid_date' }
  const days = daysBetween(startsOn, endsOn)
  if (days < 1) return { ok: false, reason: 'not_a_range' }
  if (daysBetween(today, startsOn) < 1) return { ok: false, reason: 'too_soon' }
  if (daysBetween(addDaysTo(today, MAX_DAYS_AHEAD), inclusiveEnd(endsOn)) > 0) return { ok: false, reason: 'too_far' }
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
