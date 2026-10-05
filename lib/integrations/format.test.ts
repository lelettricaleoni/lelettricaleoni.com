import { describe, expect, it } from 'vitest'
import { formatWhen } from './format'

describe('formatWhen', () => {
  it('writes a moment in the shop\'s time (Rome), not in the server\'s', () => {
    // 22:30 UTC on 4 October is 00:30 on 5 October in Rome (summer time).
    expect(formatWhen('2026-10-04T22:30:00.000Z')).toBe('5 Oct 2026, 00:30')
    expect(formatWhen('2026-01-15T10:05:00.000Z')).toBe('15 Jan 2026, 11:05')
  })

  it('says so when there is no moment', () => {
    expect(formatWhen(null)).toBe('Never')
    expect(formatWhen(null, 'Not yet')).toBe('Not yet')
  })

  it('does not throw on something that is not a date', () => {
    expect(formatWhen('not a date')).toBe('Unknown')
  })
})
