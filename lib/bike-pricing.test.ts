import { describe, it, expect } from 'vitest'
import { priceForDay, isRentalDayAllowed, applyPriceAdjustment, afternoonPriceFor } from './bike-pricing'
import type { BikeCategory } from './db'

function tableCategory(overrides: Partial<BikeCategory> = {}): BikeCategory {
  return {
    id: 'cat-1',
    name: 'Gravel',
    displayOrder: 0,
    routeCategoryId: null,
    maxRentalDays: 5,
    pricingMode: 'table',
    day1Price: '25',
    day2Price: '47',
    day3Price: '68',
    day4Price: '88',
    day5Price: '105',
    day6Price: null,
    day7Price: null,
    perDayAfterPrice: null,
    afternoonPrice: '20',
    ...overrides,
  }
}

function linearCategory(overrides: Partial<BikeCategory> = {}): BikeCategory {
  return {
    id: 'cat-2',
    name: 'Bici classica',
    displayOrder: 0,
    routeCategoryId: null,
    maxRentalDays: 7,
    pricingMode: 'linear',
    day1Price: '15',
    day2Price: null,
    day3Price: null,
    day4Price: null,
    day5Price: null,
    day6Price: null,
    day7Price: null,
    perDayAfterPrice: '10',
    afternoonPrice: null,
    ...overrides,
  }
}

describe('priceForDay', () => {
  it('reads the explicit value for a table-mode category', () => {
    expect(priceForDay(tableCategory(), 3)).toBe(68)
  })

  it('returns null past maxRentalDays even if a price is (wrongly) set', () => {
    expect(priceForDay(tableCategory({ maxRentalDays: 3 }), 4)).toBeNull()
  })

  it('returns null for a table-mode day that was never priced', () => {
    expect(priceForDay(tableCategory(), 6)).toBeNull()
  })

  it('computes a linear-mode day from day1 + perDayAfterPrice', () => {
    const cat = linearCategory()
    expect(priceForDay(cat, 1)).toBe(15)
    expect(priceForDay(cat, 2)).toBe(25)
    expect(priceForDay(cat, 4)).toBe(45)
  })

  it('returns null for day 0 or negative days', () => {
    expect(priceForDay(tableCategory(), 0)).toBeNull()
    expect(priceForDay(tableCategory(), -1)).toBeNull()
  })
})

describe('isRentalDayAllowed', () => {
  it('is true up to maxRentalDays', () => {
    const cat = tableCategory({ maxRentalDays: 5 })
    expect(isRentalDayAllowed(cat, 5)).toBe(true)
    expect(isRentalDayAllowed(cat, 6)).toBe(false)
  })
})

describe('applyPriceAdjustment', () => {
  it('leaves the price alone when there is no adjustment, cents included', () => {
    expect(applyPriceAdjustment(38, 0)).toBe(38)
    expect(applyPriceAdjustment(12.5, 0)).toBe(12.5)
  })

  it('adds a percentage, rounded to the nearest whole euro', () => {
    expect(applyPriceAdjustment(38, 15)).toBe(44) // 43.70
    expect(applyPriceAdjustment(72, 15)).toBe(83) // 82.80
    expect(applyPriceAdjustment(25, 10)).toBe(28) // 27.50 rounds up
  })

  it('takes a percentage off when it is negative', () => {
    expect(applyPriceAdjustment(38, -10)).toBe(34) // 34.20
    expect(applyPriceAdjustment(25, -10)).toBe(23) // 22.50 rounds up
    expect(applyPriceAdjustment(100, -25)).toBe(75)
  })

  it('takes a percentage with decimals', () => {
    expect(applyPriceAdjustment(100, 7.5)).toBe(108) // 107.50
    expect(applyPriceAdjustment(40, 2.5)).toBe(41)
  })

  it('does not drift on the float errors that a plain multiplication has', () => {
    // 35 * 1.1 is 38.50000000000001 and 45 * 1.1 is 49.50000000000001: both must land on the half.
    expect(applyPriceAdjustment(35, 10)).toBe(39)
    expect(applyPriceAdjustment(45, 10)).toBe(50)
  })
})

describe('priceForDay with an adjustment', () => {
  it('adjusts every day of a table category', () => {
    const category = tableCategory()
    expect([1, 2, 3, 4, 5].map((day) => priceForDay(category, day, 10))).toEqual([28, 52, 75, 97, 116])
  })

  it('adjusts a linear category after it has added the days up', () => {
    // 15 + 10 * 2 = 35 for day 3, then +10 % = 38.5 -> 39
    expect(priceForDay(linearCategory(), 3, 10)).toBe(39)
  })

  it('is the same as before when no adjustment is given', () => {
    const category = tableCategory()
    expect([1, 2, 3, 4, 5].map((day) => priceForDay(category, day))).toEqual([25, 47, 68, 88, 105])
  })

  it('still says null for a day the category does not offer', () => {
    expect(priceForDay(tableCategory(), 6, 10)).toBeNull()
    expect(priceForDay(tableCategory({ day3Price: null }), 3, 10)).toBeNull()
  })
})

describe('afternoonPriceFor', () => {
  it('adjusts the afternoon price like the others', () => {
    expect(afternoonPriceFor(tableCategory({ afternoonPrice: '27' }), 15)).toBe(31) // 31.05
  })

  it('is null when the category has no afternoon price', () => {
    expect(afternoonPriceFor(tableCategory({ afternoonPrice: null }), 15)).toBeNull()
  })

  it('is the category price when there is no adjustment', () => {
    expect(afternoonPriceFor(tableCategory({ afternoonPrice: '20' }), 0)).toBe(20)
  })
})
