import { describe, expect, it } from 'vitest'
import { phoneCountryOptions } from './phone-countries'

describe('phoneCountryOptions', () => {
  const options = phoneCountryOptions()

  it('puts Italy first and then the countries the guests come from, before the rest', () => {
    expect(options.slice(0, 4).map((o) => o.code)).toEqual(['IT', 'DE', 'AT', 'CH'])
  })

  it('names each country with its calling code', () => {
    expect(options.find((o) => o.code === 'IT')?.label).toBe('Italy +39')
    expect(options.find((o) => o.code === 'DE')?.label).toBe('Germany +49')
  })

  it('lists every country once, and the rest in alphabetical order', () => {
    expect(new Set(options.map((o) => o.code)).size).toBe(options.length)
    expect(options.length).toBeGreaterThan(200)
    const rest = options.slice(12).map((o) => o.label.replace(/ \+\d+$/, ''))
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b, 'en')))
  })
})
