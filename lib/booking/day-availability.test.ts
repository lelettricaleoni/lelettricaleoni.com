import { describe, expect, it } from 'vitest'
import {
  dayHasBike, freeForRange, freeUnits, isSelectable, lastSelectableDay, mergeRanges, type PickContext, type UnitBusy,
} from './day-availability'

// Mon 2031-11-03 … Sun 2031-11-09
const unit = (id: string, busy: [string, string][] = [], retiredOn: string | null = null): UnitBusy => ({
  unitId: id, modelId: 'm', sizeId: 's', versionId: 'v', retiredOn, busy: busy.map(([startsOn, endsOn]) => ({ startsOn, endsOn })),
})
// A is free Mon–Tue (busy from Wed), B is free Wed–Thu (busy before Wed, and from Fri).
const A = unit('A', [['2031-11-05', '2031-12-01']])
const B = unit('B', [['2031-11-01', '2031-11-05'], ['2031-11-07', '2031-12-01']])

describe('mergeRanges', () => {
  it('merges overlapping and touching periods and keeps the others apart', () => {
    expect(mergeRanges([
      { startsOn: '2031-11-10', endsOn: '2031-11-12' },
      { startsOn: '2031-11-03', endsOn: '2031-11-05' },
      { startsOn: '2031-11-05', endsOn: '2031-11-06' },
      { startsOn: '2031-11-04', endsOn: '2031-11-05' },
    ])).toEqual([
      { startsOn: '2031-11-03', endsOn: '2031-11-06' },
      { startsOn: '2031-11-10', endsOn: '2031-11-12' },
    ])
  })
  it('is empty for nothing', () => expect(mergeRanges([])).toEqual([]))
})

describe('freeUnits / dayHasBike', () => {
  it('the end of a busy period is exclusive: the bike is free that day', () => {
    expect(freeUnits([B], '2031-11-04')).toHaveLength(0)
    expect(freeUnits([B], '2031-11-05')).toHaveLength(1)
    expect(freeUnits([B], '2031-11-06')).toHaveLength(1)
    expect(freeUnits([B], '2031-11-07')).toHaveLength(0)
  })
  it('a bike retired on a day is not free that day nor after, but is the day before', () => {
    const retired = unit('R', [], '2031-11-05')
    expect(dayHasBike([retired], '2031-11-04')).toBe(true)
    expect(dayHasBike([retired], '2031-11-05')).toBe(false)
    expect(dayHasBike([retired], '2031-11-20')).toBe(false)
  })
  it('a day has a bike when one of several is free', () => {
    expect(dayHasBike([A, B], '2031-11-03')).toBe(true)
    expect(dayHasBike([A, B], '2031-11-05')).toBe(true)
    expect(dayHasBike([A, B], '2031-11-08')).toBe(false)
  })
})

describe('freeForRange', () => {
  it('keeps the bikes free for every day of the stay, with the end exclusive', () => {
    expect(freeForRange([A, B], { startsOn: '2031-11-03', endsOn: '2031-11-05' }).map((u) => u.unitId)).toEqual(['A'])
    expect(freeForRange([A, B], { startsOn: '2031-11-05', endsOn: '2031-11-07' }).map((u) => u.unitId)).toEqual(['B'])
    expect(freeForRange([A, B], { startsOn: '2031-11-03', endsOn: '2031-11-07' })).toEqual([])
  })
  it('refuses a bike retired before the last day of the stay', () => {
    const retired = unit('R', [], '2031-11-05')
    expect(freeForRange([retired], { startsOn: '2031-11-03', endsOn: '2031-11-05' })).toHaveLength(1)
    expect(freeForRange([retired], { startsOn: '2031-11-03', endsOn: '2031-11-06' })).toHaveLength(0)
  })
})

describe('lastSelectableDay', () => {
  it('is the furthest day one bike can cover from the start (Kevin: Mon–Tue on A, Wed–Thu on B)', () => {
    expect(lastSelectableDay([A, B], '2031-11-03', 7)).toBe('2031-11-04')
    expect(lastSelectableDay([A, B], '2031-11-05', 7)).toBe('2031-11-06')
  })
  it('stops at the maximum days of the category', () => {
    expect(lastSelectableDay([unit('free')], '2031-11-03', 3)).toBe('2031-11-05')
    expect(lastSelectableDay([unit('free')], '2031-11-03', 1)).toBe('2031-11-03')
  })
  it('stops the day before the bike is retired', () => {
    expect(lastSelectableDay([unit('R', [], '2031-11-06')], '2031-11-03', 7)).toBe('2031-11-05')
  })
  it('takes the bike that goes furthest', () => {
    const long = unit('L', [['2031-11-09', '2031-12-01']])
    expect(lastSelectableDay([A, long], '2031-11-03', 7)).toBe('2031-11-08')
  })
  it('is null when no bike is free that day', () => {
    expect(lastSelectableDay([A, B], '2031-11-08', 7)).toBeNull()
  })
})

describe('isSelectable', () => {
  const base: PickContext = { units: [A, B], minDay: '2031-11-03', maxDay: '2031-11-20', start: null, maxDays: null }
  it('says why a day is off, in this order: past, too far, closed, no bike', () => {
    expect(isSelectable('2031-11-02', base)).toEqual({ ok: false, reason: 'past' })
    expect(isSelectable('2031-11-21', base)).toEqual({ ok: false, reason: 'too_far' })
    expect(isSelectable('2031-11-10', { ...base, isClosed: () => true })).toEqual({ ok: false, reason: 'closed' })
    expect(isSelectable('2031-11-08', base)).toEqual({ ok: false, reason: 'no_bike' })
    expect(isSelectable('2031-11-03', base)).toEqual({ ok: true })
  })
  it('with a start and a limit in days, a day past what one bike covers is off, even if some bike is free that day', () => {
    const ctx = { ...base, start: '2031-11-03', maxDays: 7 }
    expect(isSelectable('2031-11-04', ctx)).toEqual({ ok: true })
    expect(isSelectable('2031-11-05', ctx)).toEqual({ ok: false, reason: 'beyond_end' })
    expect(isSelectable('2031-11-06', ctx)).toEqual({ ok: false, reason: 'beyond_end' })
  })
  it('a day before the start is always a valid new start, never beyond_end', () => {
    expect(isSelectable('2031-11-03', { ...base, start: '2031-11-05', maxDays: 7 })).toEqual({ ok: true })
  })
  it('without a limit in days (by days) nothing is beyond_end', () => {
    expect(isSelectable('2031-11-06', { ...base, start: '2031-11-03', maxDays: null })).toEqual({ ok: true })
  })
})
