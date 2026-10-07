import type { BikeCategory } from './db'

/**
 * The price for renting a category's bike on rental day N (1-indexed), or
 * null when that day isn't offered — either because it's past
 * `maxRentalDays`, or because a table-mode category left that day's price
 * empty.
 *
 * Prices come back from postgres.js as strings (NUMERIC columns), never
 * numbers — every value here is parsed, not trusted as-is.
 */
export function priceForDay(category: BikeCategory, day: number, adjustmentPercent = 0): number | null {
  const base = categoryPriceForDay(category, day)
  return base === null ? null : applyPriceAdjustment(base, adjustmentPercent)
}

function categoryPriceForDay(category: BikeCategory, day: number): number | null {
  if (!isRentalDayAllowed(category, day)) return null

  if (category.pricingMode === 'linear') {
    const day1 = Number(category.day1Price)
    const perDayAfter = category.perDayAfterPrice !== null ? Number(category.perDayAfterPrice) : null
    if (day === 1) return day1
    if (perDayAfter === null) return null
    return day1 + perDayAfter * (day - 1)
  }

  const dayPrices: Record<number, string | null> = {
    1: category.day1Price,
    2: category.day2Price,
    3: category.day3Price,
    4: category.day4Price,
    5: category.day5Price,
    6: category.day6Price,
    7: category.day7Price,
  }
  const raw = dayPrices[day]
  return raw !== null && raw !== undefined ? Number(raw) : null
}

/** Whether a category can be rented for this many days at all. */
export function isRentalDayAllowed(category: BikeCategory, day: number): boolean {
  return day >= 1 && day <= category.maxRentalDays
}

/**
 * A model's own percentage on top of its category's prices: +10 adds a tenth to every price of the
 * category, -10 takes a tenth off. The category stays the single table of prices; a model only moves
 * all of them together.
 *
 * With an adjustment the result is rounded to the nearest whole euro, which is how the shop prices;
 * without one the category's price is returned untouched, cents and all. The multiplication is done
 * in cents and basis points, because a plain `35 * 1.1` is 38.50000000000001 and the rounding would
 * then depend on which side of the half the float happened to fall.
 */
export function applyPriceAdjustment(price: number, percent: number): number {
  if (!percent) return price
  const cents = Math.round(price * 100)
  const adjustedCents = Math.round((cents * (10_000 + Math.round(percent * 100))) / 10_000)
  return Math.round(adjustedCents / 100)
}

/** The category's half-day (afternoon) price with the model's percentage, or null when there is none. */
export function afternoonPriceFor(category: BikeCategory, adjustmentPercent = 0): number | null {
  return category.afternoonPrice === null ? null : applyPriceAdjustment(Number(category.afternoonPrice), adjustmentPercent)
}
