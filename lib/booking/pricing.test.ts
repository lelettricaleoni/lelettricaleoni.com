import { describe, expect, it } from 'vitest'
import type { BikeCategory } from '@/lib/db'
import { stayPriceCents, sumCents } from './pricing'

const table: BikeCategory = {
  id: 'c1', name: 'Gravel', displayOrder: 0, routeCategoryId: null, maxRentalDays: 7, pricingMode: 'table',
  day1Price: '25', day2Price: '47', day3Price: '68', day4Price: '88', day5Price: '105', day6Price: '120', day7Price: '135',
  perDayAfterPrice: null, afternoonPrice: '20',
}
const linear: BikeCategory = { ...table, id: 'c2', name: 'City', pricingMode: 'linear', maxRentalDays: 14, day1Price: '10', perDayAfterPrice: '8' }

describe('stayPriceCents', () => {
  it('is the price of the whole stay, from the table, in cents', () => {
    expect(stayPriceCents(table, 1, 0)).toBe(2500)
    expect(stayPriceCents(table, 3, 0)).toBe(6800)
    expect(stayPriceCents(table, 7, 0)).toBe(13500)
  })

  it('follows the line for a category priced per day after the first', () => {
    expect(stayPriceCents(linear, 3, 0)).toBe(2600)
    expect(stayPriceCents(linear, 14, 0)).toBe(11400)
  })

  it('applies the model\'s percentage and rounds to the whole euro, as the shop does', () => {
    expect(stayPriceCents(table, 3, 10)).toBe(7500) // 68 + 10% = 74.80
    expect(stayPriceCents(table, 3, -10)).toBe(6100) // 68 - 10% = 61.20
  })

  it('is null for a number of days the category does not offer', () => {
    expect(stayPriceCents(table, 8, 0)).toBeNull()
    expect(stayPriceCents(table, 0, 0)).toBeNull()
    expect(stayPriceCents({ ...table, day3Price: null }, 3, 0)).toBeNull()
  })
})

describe('sumCents', () => {
  it('adds whole cents without drifting', () => {
    expect(sumCents([6800, 2500, 7500])).toBe(16800)
    expect(sumCents([])).toBe(0)
  })
})
