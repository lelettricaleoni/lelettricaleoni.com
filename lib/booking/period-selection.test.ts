import { describe, expect, it } from 'vitest'
import type { UnitBusy } from './day-availability'
import { EMPTY_SELECTION, firstBookableDay, pickDay, rangeToSelection, selectionToRange } from './period-selection'

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

describe('firstBookableDay: the day the page opens on', () => {
  const unit = (id: string, busy: [string, string][] = [], retiredOn: string | null = null): UnitBusy => ({
    unitId: id, modelId: 'm', sizeId: 's', versionId: 'v', retiredOn, busy: busy.map(([startsOn, endsOn]) => ({ startsOn, endsOn })),
  })
  const ctx = (units: UnitBusy[], isClosed?: (day: string) => boolean) => ({ units, minDay: '2031-11-03', maxDay: '2031-11-10', isClosed })

  it('is tomorrow (the first day that can be booked) when a bike is free then', () => {
    expect(firstBookableDay(ctx([unit('A')]))).toBe('2031-11-03')
  })
  it('is the next day when tomorrow has no bike free', () => {
    expect(firstBookableDay(ctx([unit('A', [['2031-11-01', '2031-11-05']])]))).toBe('2031-11-05')
  })
  it('is the next day when the shop is closed tomorrow', () => {
    expect(firstBookableDay(ctx([unit('A')], (day) => day === '2031-11-03'))).toBe('2031-11-04')
  })
  it('is null when nothing can be booked in the whole window', () => {
    expect(firstBookableDay(ctx([unit('A', [['2031-11-01', '2031-12-01']])]))).toBeNull()
    expect(firstBookableDay(ctx([]))).toBeNull()
  })
  it('does not go past the last day that can be booked', () => {
    expect(firstBookableDay({ units: [unit('A')], minDay: '2031-11-10', maxDay: '2031-11-09' })).toBeNull()
  })
})
