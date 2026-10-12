import { describe, expect, it } from 'vitest'
import type { PickContext, UnitBusy } from './day-availability'
import { EMPTY_SELECTION, canBook, pickDay, rangeToSelection, selectionToRange, shiftRange } from './period-selection'

describe('pickDay', () => {
  it('the first tap starts, the second ends', () => {
    const one = pickDay(EMPTY_SELECTION, '2031-11-03')
    expect(one).toEqual({ start: '2031-11-03', end: null })
    expect(pickDay(one, '2031-11-05')).toEqual({ start: '2031-11-03', end: '2031-11-05' })
  })
  it('the same day twice is a stay of one day', () => {
    const one = pickDay(EMPTY_SELECTION, '2031-11-03')
    expect(selectionToRange(pickDay(one, '2031-11-03'))).toEqual({ startsOn: '2031-11-03', endsOn: '2031-11-04' })
  })
  it('a tap before the start starts again from there', () => {
    const one = pickDay(EMPTY_SELECTION, '2031-11-05')
    expect(pickDay(one, '2031-11-03')).toEqual({ start: '2031-11-03', end: null })
  })
  it('a tap on a finished period starts a new one', () => {
    expect(pickDay({ start: '2031-11-03', end: '2031-11-05' }, '2031-11-10')).toEqual({ start: '2031-11-10', end: null })
  })
})

describe('selection and range', () => {
  it('has no range until both days are there', () => {
    expect(selectionToRange({ start: '2031-11-03', end: null })).toBeNull()
    expect(selectionToRange(EMPTY_SELECTION)).toBeNull()
  })
  it('round-trips a stay: the last day is included in the selection, excluded in the range', () => {
    const range = { startsOn: '2031-11-03', endsOn: '2031-11-06' }
    expect(rangeToSelection(range)).toEqual({ start: '2031-11-03', end: '2031-11-05' })
    expect(selectionToRange(rangeToSelection(range))).toEqual(range)
    expect(rangeToSelection(null)).toEqual(EMPTY_SELECTION)
  })
})

describe('shiftRange', () => {
  it('moves the whole stay, keeping its length', () => {
    expect(shiftRange({ startsOn: '2031-11-03', endsOn: '2031-11-06' }, 1)).toEqual({ startsOn: '2031-11-04', endsOn: '2031-11-07' })
    expect(shiftRange({ startsOn: '2031-11-03', endsOn: '2031-11-06' }, -1)).toEqual({ startsOn: '2031-11-02', endsOn: '2031-11-05' })
    expect(shiftRange({ startsOn: '2031-10-30', endsOn: '2031-11-02' }, 3)).toEqual({ startsOn: '2031-11-02', endsOn: '2031-11-05' })
  })
})

describe('canBook', () => {
  const unit = (id: string, busy: [string, string][] = [], retiredOn: string | null = null): UnitBusy => ({
    unitId: id, modelId: 'm', sizeId: 's', versionId: 'v', retiredOn, busy: busy.map(([startsOn, endsOn]) => ({ startsOn, endsOn })),
  })
  const ctx = (units: UnitBusy[], maxDays: number | null = null): Omit<PickContext, 'start'> =>
    ({ units, minDay: '2031-11-03', maxDay: '2031-11-20', maxDays })
  const stay = (a: string, b: string) => ({ startsOn: a, endsOn: b })

  it('is true when a bike is free for the whole stay', () => {
    expect(canBook(stay('2031-11-04', '2031-11-07'), ctx([unit('A')]))).toBe(true)
  })
  it('is false when no single bike covers it, even if every day has some bike', () => {
    const units = [unit('A', [['2031-11-05', '2031-12-01']]), unit('B', [['2031-11-01', '2031-11-05']])]
    expect(canBook(stay('2031-11-03', '2031-11-07'), ctx(units))).toBe(false)
  })
  it('is false before the first sellable day and past the last', () => {
    expect(canBook(stay('2031-11-02', '2031-11-04'), ctx([unit('A')]))).toBe(false)
    expect(canBook(stay('2031-11-20', '2031-11-22'), ctx([unit('A')]))).toBe(false)
  })
  it('is false past the days the category allows', () => {
    expect(canBook(stay('2031-11-04', '2031-11-08'), ctx([unit('A')], 3))).toBe(false)
    expect(canBook(stay('2031-11-04', '2031-11-07'), ctx([unit('A')], 3))).toBe(true)
  })
  it('does not look at a closed day in the middle, only at the two ends', () => {
    const closedMiddle = { ...ctx([unit('A')]), isClosed: (day: string) => day === '2031-11-05' }
    expect(canBook(stay('2031-11-04', '2031-11-07'), closedMiddle)).toBe(true)
    expect(canBook(stay('2031-11-05', '2031-11-07'), closedMiddle)).toBe(false)
  })
})
