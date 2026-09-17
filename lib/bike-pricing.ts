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
export function priceForDay(category: BikeCategory, day: number): number | null {
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
