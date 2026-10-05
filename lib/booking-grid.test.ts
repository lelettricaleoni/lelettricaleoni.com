import { describe, it, expect } from 'vitest'
import { layoutBlocks, occupiedDayRanges } from './booking-grid'

const res = (startsOn: string, endsOn: string, id = 'r1') => ({
  id, kind: 'counter_rental' as const, startsOn, endsOn, label: 'Rossi', customer: { id: 'c1', firstName: 'Mario', lastName: 'Rossi', email: null, phone: null, notes: null }, amountCents: 4500,
})

describe('layoutBlocks', () => {
  it('places a reservation inside the month on its columns', () => {
    expect(layoutBlocks('2031-07', [res('2031-07-10', '2031-07-13')])).toEqual([
      { reservationId: 'r1', kind: 'counter_rental', label: 'Rossi', startColumn: 10, span: 3, clippedStart: false, clippedEnd: false },
    ])
  })

  it('clips one that started in the previous month', () => {
    const [block] = layoutBlocks('2031-07', [res('2031-06-28', '2031-07-03')])
    expect(block).toMatchObject({ startColumn: 1, span: 2, clippedStart: true, clippedEnd: false })
  })

  it('clips one that ends in the next month', () => {
    const [block] = layoutBlocks('2031-07', [res('2031-07-30', '2031-08-04')])
    expect(block).toMatchObject({ startColumn: 30, span: 2, clippedStart: false, clippedEnd: true })
  })

  it('covers the whole month when it starts before and ends after', () => {
    const [block] = layoutBlocks('2031-07', [res('2031-06-20', '2031-08-10')])
    expect(block).toMatchObject({ startColumn: 1, span: 31, clippedStart: true, clippedEnd: true })
  })

  it('reaches the last day of a 31-day month exactly, without clipping', () => {
    const [block] = layoutBlocks('2031-07', [res('2031-07-29', '2031-08-01')])
    expect(block).toMatchObject({ startColumn: 29, span: 3, clippedEnd: false })
  })

  it('counts the right number of columns in February, leap year included', () => {
    expect(layoutBlocks('2031-02', [res('2031-02-27', '2031-03-05')])[0]).toMatchObject({ startColumn: 27, span: 2, clippedEnd: true })
    expect(layoutBlocks('2028-02', [res('2028-02-27', '2028-03-05')])[0]).toMatchObject({ startColumn: 27, span: 3, clippedEnd: true })
  })

  it('leaves out a reservation that ends the day the month starts, or starts the day it ends', () => {
    expect(layoutBlocks('2031-07', [res('2031-06-28', '2031-07-01')])).toEqual([])
    expect(layoutBlocks('2031-07', [res('2031-08-01', '2031-08-03')])).toEqual([])
  })

  it('keeps every reservation it is given, in order', () => {
    const blocks = layoutBlocks('2031-07', [res('2031-07-01', '2031-07-03', 'a'), res('2031-07-03', '2031-07-05', 'b')])
    expect(blocks.map((b) => b.reservationId)).toEqual(['a', 'b'])
  })
})

describe('occupiedDayRanges', () => {
  it('turns stored ranges into the days the picker must disable, last day included', () => {
    const [range] = occupiedDayRanges([{ startsOn: '2031-07-10', endsOn: '2031-07-13' }])
    expect(range.from.getDate()).toBe(10)
    expect(range.to.getDate()).toBe(12)
  })
})
