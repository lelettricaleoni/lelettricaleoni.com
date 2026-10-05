import { describe, expect, it } from 'vitest'
import { formatEuros, toCents } from './money'

describe('toCents', () => {
  it('turns euros into whole cents, absorbing the float noise', () => {
    expect(toCents(45)).toBe(4500)
    expect(toCents(45.5)).toBe(4550)
    expect(toCents(0.1 + 0.2)).toBe(30)
    expect(toCents(19.99)).toBe(1999)
  })
})

describe('formatEuros', () => {
  it('writes cents the way the shop reads them, without a ,00 on round amounts', () => {
    expect(formatEuros(4500)).toMatch(/^45\s?€$/)
    expect(formatEuros(4550)).toMatch(/^45,50\s?€$/)
    expect(formatEuros(0)).toMatch(/^0\s?€$/)
  })

  it('groups thousands the Italian way (from five digits up)', () => {
    expect(formatEuros(1234567)).toMatch(/^12\.345,67\s?€$/)
  })
})
