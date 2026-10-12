import { describe, expect, it } from 'vitest'
import { formatPrice } from '@/lib/money'
import { fill, formatDay, formatDays, formatDeadline } from './format'

describe('formatPrice: an amount the way each language writes it', () => {
  it('drops the cents on a round amount and keeps them otherwise', () => {
    expect(formatPrice(2400, 'it')).toMatch(/^24\s?€$/)
    expect(formatPrice(2450, 'it')).toMatch(/^24,50\s?€$/)
    expect(formatPrice(2400, 'en')).toBe('€24')
    expect(formatPrice(2450, 'en')).toBe('€24.50')
    expect(formatPrice(2400, 'de')).toMatch(/^24\s?€$/)
    expect(formatPrice(2450, 'de')).toMatch(/^24,50\s?€$/)
  })
})

describe('formatDays: the first and last day, both included', () => {
  it('writes the days of a stay in the language of the page', () => {
    expect(formatDays({ startsOn: '2031-11-03', endsOn: '2031-11-06' }, 'it')).toMatch(/3.+5.+nov/i)
    expect(formatDays({ startsOn: '2031-11-03', endsOn: '2031-11-06' }, 'en')).toMatch(/3.+5.+Nov/)
    expect(formatDays({ startsOn: '2031-11-03', endsOn: '2031-11-06' }, 'de')).toMatch(/3.+5.+Nov/)
  })

  it('writes a single day and a stay across two months', () => {
    expect(formatDays({ startsOn: '2031-11-03', endsOn: '2031-11-04' }, 'it')).toMatch(/3\s+nov/i)
    expect(formatDays({ startsOn: '2031-10-30', endsOn: '2031-11-03' }, 'it')).toMatch(/30 ott.+2 nov/i)
  })

  it('can put the weekday on both ends', () => {
    expect(formatDays({ startsOn: '2031-11-03', endsOn: '2031-11-06' }, 'it', { weekday: true })).toMatch(/lun.+3.+mer.+5.+nov/i)
    expect(formatDays({ startsOn: '2031-11-03', endsOn: '2031-11-06' }, 'en', { weekday: true })).toMatch(/Mon.+3.+Wed.+5.+Nov/)
  })

  it('writes one day with its weekday, for the places that have room', () => {
    expect(formatDay('2031-11-03', 'it')).toMatch(/lun/i)
    expect(formatDay('2031-11-03', 'en')).toMatch(/Mon/)
  })
})

describe('fill: the {placeholders} of a text', () => {
  it('replaces each name with its value, and leaves the unknown ones as they are', () => {
    expect(fill('{n} giorni', { n: 3 })).toBe('3 giorni')
    expect(fill('{a} e {b}', { a: 'x', b: 'y' })).toBe('x e y')
    expect(fill('{a} {zzz}', { a: 1 })).toBe('1 {zzz}')
  })
})

describe('the year, and the deadline of a refund', () => {
  it('writes the year when asked, for bookings that are not in the current season', () => {
    expect(formatDays({ startsOn: '2031-11-03', endsOn: '2031-11-06' }, 'it', { year: true })).toMatch(/2031/)
    expect(formatDays({ startsOn: '2031-11-03', endsOn: '2031-11-06' }, 'it')).not.toMatch(/2031/)
  })

  it('writes the deadline in the time of Rome, whatever the server clock', () => {
    // 2031-12-08T08:00Z is 09:00 in Rome (winter time)
    expect(formatDeadline(new Date('2031-12-08T08:00:00Z'), 'it')).toMatch(/8 dicembre.+09[:.]00/)
    expect(formatDeadline(new Date('2031-07-08T07:00:00Z'), 'en')).toMatch(/8 July.+09:00/)
    expect(formatDeadline(new Date('2031-07-08T07:00:00Z'), 'de')).toMatch(/8\. Juli.+09:00/)
  })
})
