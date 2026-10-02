import { describe, it, expect } from 'vitest'
import {
  todayInRome, currentMonthInRome, isoDay, dayToDate, isValidDay, addDaysTo, exclusiveEnd, inclusiveEnd,
  daysBetween, parseMonth, shiftMonth, monthDays, monthTitle, dayOfMonth, weekdayLetter, isWeekendDay,
  rangesOverlap, buildRange,
} from './dates'

describe('todayInRome', () => {
  it('is already the next day in Rome after 22:00 UTC in summer (UTC+2)', () => {
    expect(todayInRome(new Date('2026-07-09T21:59:59Z'))).toBe('2026-07-09')
    expect(todayInRome(new Date('2026-07-09T22:00:00Z'))).toBe('2026-07-10')
  })

  it('is already the next day in Rome after 23:00 UTC in winter (UTC+1)', () => {
    expect(todayInRome(new Date('2026-01-09T22:59:59Z'))).toBe('2026-01-09')
    expect(todayInRome(new Date('2026-01-09T23:00:00Z'))).toBe('2026-01-10')
  })

  it('follows the switch to summer time (2026-03-29)', () => {
    expect(todayInRome(new Date('2026-03-28T22:59:59Z'))).toBe('2026-03-28')
    expect(todayInRome(new Date('2026-03-28T23:00:00Z'))).toBe('2026-03-29')
    expect(todayInRome(new Date('2026-03-29T21:59:59Z'))).toBe('2026-03-29')
    expect(todayInRome(new Date('2026-03-29T22:00:00Z'))).toBe('2026-03-30')
  })

  it('names the month in Rome too', () => {
    expect(currentMonthInRome(new Date('2026-07-31T21:59:59Z'))).toBe('2026-07')
    expect(currentMonthInRome(new Date('2026-07-31T22:00:00Z'))).toBe('2026-08')
  })
})

describe('isValidDay', () => {
  it('accepts real calendar days, leap days included', () => {
    expect(isValidDay('2026-07-10')).toBe(true)
    expect(isValidDay('2028-02-29')).toBe(true)
  })

  it('rejects impossible or badly formatted days', () => {
    expect(isValidDay('2027-02-29')).toBe(false)
    expect(isValidDay('2026-02-30')).toBe(false)
    expect(isValidDay('2026-7-1')).toBe(false)
    expect(isValidDay('2026-07-10T00:00')).toBe(false)
    expect(isValidDay('')).toBe(false)
  })
})

describe('day arithmetic', () => {
  it('turns the last day included into the exclusive end, and back', () => {
    expect(exclusiveEnd('2026-07-12')).toBe('2026-07-13')
    expect(exclusiveEnd('2026-02-28')).toBe('2026-03-01')
    expect(exclusiveEnd('2028-02-28')).toBe('2028-02-29')
    expect(exclusiveEnd('2026-12-31')).toBe('2027-01-01')
    expect(inclusiveEnd('2026-07-13')).toBe('2026-07-12')
    expect(inclusiveEnd('2026-03-01')).toBe('2026-02-28')
  })

  it('counts calendar days, also across the summer time switch', () => {
    expect(daysBetween('2026-07-10', '2026-07-13')).toBe(3)
    expect(daysBetween('2026-07-13', '2026-07-10')).toBe(-3)
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
    expect(addDaysTo('2026-03-28', 2)).toBe('2026-03-30')
  })

  it('round-trips through the Date used by the calendar widget', () => {
    for (const day of ['2026-07-10', '2026-03-29', '2026-10-25', '2028-02-29']) {
      expect(isoDay(dayToDate(day))).toBe(day)
    }
    expect(isoDay(new Date(2026, 6, 10))).toBe('2026-07-10')
  })
})

describe('months', () => {
  it('lists the days of a month', () => {
    expect(monthDays('2026-07')).toHaveLength(31)
    expect(monthDays('2026-02')).toHaveLength(28)
    expect(monthDays('2028-02')).toHaveLength(29)
    expect(monthDays('2026-07')[0]).toBe('2026-07-01')
    expect(monthDays('2026-07')[30]).toBe('2026-07-31')
  })

  it('parses a month parameter and rejects the rest', () => {
    expect(parseMonth('2026-07')).toBe('2026-07')
    expect(parseMonth('2026-7')).toBeNull()
    expect(parseMonth('2026-13')).toBeNull()
    expect(parseMonth('abc')).toBeNull()
    expect(parseMonth(undefined)).toBeNull()
  })

  it('moves between months across the year boundary', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })

  it('has labels for the grid header', () => {
    expect(monthTitle('2026-07')).toBe('July 2026')
    expect(dayOfMonth('2026-07-10')).toBe(10)
    expect(weekdayLetter('2026-07-10')).toBe('F')
    expect(isWeekendDay('2026-07-11')).toBe(true)
    expect(isWeekendDay('2026-07-10')).toBe(false)
  })
})

describe('rangesOverlap (end exclusive)', () => {
  const rental = { startsOn: '2026-07-10', endsOn: '2026-07-13' }

  it('overlaps when days are shared', () => {
    expect(rangesOverlap(rental, { startsOn: '2026-07-12', endsOn: '2026-07-15' })).toBe(true)
    expect(rangesOverlap(rental, { startsOn: '2026-07-11', endsOn: '2026-07-12' })).toBe(true)
  })

  it('does not overlap when one ends the day the other starts', () => {
    expect(rangesOverlap(rental, { startsOn: '2026-07-13', endsOn: '2026-07-15' })).toBe(false)
    expect(rangesOverlap(rental, { startsOn: '2026-07-08', endsOn: '2026-07-10' })).toBe(false)
  })
})

describe('buildRange', () => {
  it('turns first and last day included into start and exclusive end', () => {
    expect(buildRange('2026-07-10', '2026-07-12')).toEqual({ ok: true, startsOn: '2026-07-10', endsOn: '2026-07-13' })
  })

  it('accepts a single day', () => {
    expect(buildRange('2026-07-10', '2026-07-10')).toEqual({ ok: true, startsOn: '2026-07-10', endsOn: '2026-07-11' })
  })

  it('rejects a last day before the first, and invalid days', () => {
    expect(buildRange('2026-07-12', '2026-07-10')).toEqual({ ok: false, reason: 'end_before_start' })
    expect(buildRange('2026-02-30', '2026-03-02')).toEqual({ ok: false, reason: 'invalid_day' })
  })
})
