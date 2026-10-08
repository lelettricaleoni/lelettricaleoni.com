import type { BikeCategory } from '@/lib/db'
import { priceForDay } from '@/lib/bike-pricing'
import { toCents } from '@/lib/money'

/**
 * What a stay of `days` whole days costs for one bike, in cents, or null when the category does not offer that many days.
 * The price list is by DURATION (a table of 1 to 7 days, or a line), so this is the price of the whole stay, not of one day.
 * The model's own percentage is applied on top. Always computed on the server: the browser shows an estimate, never decides.
 */
export function stayPriceCents(category: BikeCategory, days: number, adjustmentPercent: number): number | null {
  const euros = priceForDay(category, days, adjustmentPercent)
  return euros === null ? null : toCents(euros)
}

/** The total of a cart: whole cents, so adding never drifts. */
export function sumCents(amounts: number[]): number {
  return amounts.reduce((sum, amount) => sum + amount, 0)
}
