import { describe, expect, it } from 'vitest'
import { formatPrice } from '@/lib/money'
import { formatDay, formatDays, fill } from './format'

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
