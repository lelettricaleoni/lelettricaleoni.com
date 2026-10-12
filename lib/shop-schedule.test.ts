import { describe, expect, it } from 'vitest'
import { EMPTY_SCHEDULE, closingTimeOn, hoursOn, isClosedOn, isoWeekday, validateWeek, type ShopSchedule } from './shop-schedule'

const DAY = [{ opensAt: '09:00', closesAt: '13:00' }, { opensAt: '14:00', closesAt: '19:00' }]
const week = (overrides: Record<number, { opensAt: string; closesAt: string }[]> = {}) =>
  ({ 1: DAY, 2: DAY, 3: DAY, 4: DAY, 5: DAY, 6: DAY, 7: DAY, ...overrides })
const schedule = (over: Partial<ShopSchedule> = {}): ShopSchedule => ({ weekly: week(), closures: [], ...over })

describe('isoWeekday', () => {
  it('counts Monday as 1 and Sunday as 7', () => {
    expect(isoWeekday('2031-11-03')).toBe(1) // a Monday
    expect(isoWeekday('2031-11-09')).toBe(7) // a Sunday
  })
})

describe('isClosedOn / hoursOn / closingTimeOn', () => {
  it('is open on a day with ranges, and says when it closes', () => {
    expect(isClosedOn(schedule(), '2031-11-03')).toBe(false)
    expect(hoursOn(schedule(), '2031-11-03')).toEqual(DAY)
    expect(closingTimeOn(schedule(), '2031-11-03')).toBe('19:00')
  })
  it('a weekday with no range is closed, and has no closing time', () => {
    const s = schedule({ weekly: week({ 7: [] }) })
    expect(isClosedOn(s, '2031-11-09')).toBe(true)
    expect(hoursOn(s, '2031-11-09')).toEqual([])
    expect(closingTimeOn(s, '2031-11-09')).toBeNull()
  })
  it('a closure covers its first day and its last day included, and not the day it ends (exclusive)', () => {
    const s = schedule({ closures: [{ startsOn: '2031-11-04', endsOn: '2031-11-06' }] })
    expect(isClosedOn(s, '2031-11-03')).toBe(false)
    expect(isClosedOn(s, '2031-11-04')).toBe(true)
    expect(isClosedOn(s, '2031-11-05')).toBe(true)
    expect(isClosedOn(s, '2031-11-06')).toBe(false)
    expect(hoursOn(s, '2031-11-05')).toEqual([])
  })
  it('the closing time is the latest closing of the day, whatever the order of the ranges', () => {
    const s = schedule({ weekly: week({ 1: [{ opensAt: '15:00', closesAt: '20:00' }, { opensAt: '09:00', closesAt: '12:00' }] }) })
    expect(closingTimeOn(s, '2031-11-03')).toBe('20:00')
  })
  it('an empty schedule is closed every day (nothing declared yet)', () => {
    expect(isClosedOn(EMPTY_SCHEDULE, '2031-11-03')).toBe(true)
  })
})

describe('validateWeek', () => {
  it('accepts a normal week, and ranges that touch (13:00 closes, 13:00 opens)', () => {
    expect(validateWeek(week())).toBeNull()
    expect(validateWeek(week({ 2: [{ opensAt: '09:00', closesAt: '13:00' }, { opensAt: '13:00', closesAt: '19:00' }] }))).toBeNull()
  })
  it('refuses a range that closes before or when it opens', () => {
    expect(validateWeek(week({ 2: [{ opensAt: '13:00', closesAt: '09:00' }] }))).toMatch(/before it closes/)
    expect(validateWeek(week({ 2: [{ opensAt: '09:00', closesAt: '09:00' }] }))).toMatch(/before it closes/)
  })
  it('refuses ranges of one day that overlap, in any order', () => {
    expect(validateWeek(week({ 3: [{ opensAt: '09:00', closesAt: '14:00' }, { opensAt: '13:00', closesAt: '19:00' }] }))).toMatch(/overlap/)
    expect(validateWeek(week({ 3: [{ opensAt: '13:00', closesAt: '19:00' }, { opensAt: '09:00', closesAt: '14:00' }] }))).toMatch(/overlap/)
  })
})
