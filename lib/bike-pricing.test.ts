import { describe, it, expect } from 'vitest'
import { priceForDay, isRentalDayAllowed } from './bike-pricing'
import type { BikeCategory } from './db'

function tableCategory(overrides: Partial<BikeCategory> = {}): BikeCategory {
  return {
    id: 'cat-1',
    name: 'Gravel',
    displayOrder: 0,
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
