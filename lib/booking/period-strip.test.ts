import { describe, expect, it } from 'vitest'
import { mondayOf, pageWeek, weekDays, weekStartFor } from './period-strip'

// 2031-11-03 is a Monday.
describe('mondayOf / weekDays', () => {
  it('goes back to the Monday of the week, and a Monday is its own', () => {
    expect(mondayOf('2031-11-03')).toBe('2031-11-03')
    expect(mondayOf('2031-11-05')).toBe('2031-11-03')
    expect(mondayOf('2031-11-09')).toBe('2031-11-03') // a Sunday
    expect(mondayOf('2031-11-10')).toBe('2031-11-10')
  })
  it('crosses the end of a month and of a year', () => {
    expect(mondayOf('2031-12-02')).toBe('2031-12-01')
    expect(mondayOf('2032-01-01')).toBe('2031-12-29')
  })
  it('lists the seven days from the Monday, across a month', () => {
    expect(weekDays('2031-10-27')).toEqual(['2031-10-27', '2031-10-28', '2031-10-29', '2031-10-30', '2031-10-31', '2031-11-01', '2031-11-02'])
  })
})

describe('weekStartFor', () => {
  const bounds = { minDay: '2031-11-05', maxDay: '2032-05-01' }
  it('is the week of the day, and the first week for a day before it can be booked', () => {
    expect(weekStartFor('2031-11-12', bounds)).toBe('2031-11-10')
    expect(weekStartFor('2031-10-01', bounds)).toBe('2031-11-03') // the week of the first bookable day
  })
  it('is the last week for a day past the last bookable one', () => {
    expect(weekStartFor('2033-01-01', bounds)).toBe(mondayOf('2032-05-01'))
  })
})

describe('pageWeek', () => {
  const bounds = { minDay: '2031-11-05', maxDay: '2031-12-02' }
  it('moves a week at a time', () => {
    expect(pageWeek('2031-11-10', 1, bounds)).toBe('2031-11-17')
    expect(pageWeek('2031-11-10', -1, bounds)).toBe('2031-11-03')
  })
  it('stops at the week of the first and of the last day that can be booked', () => {
    expect(pageWeek('2031-11-03', -1, bounds)).toBeNull() // already the week of 5 Nov
    expect(pageWeek('2031-12-01', 1, bounds)).toBeNull() // already the week of 2 Dec
    expect(pageWeek('2031-11-24', 1, bounds)).toBe('2031-12-01')
  })
})
