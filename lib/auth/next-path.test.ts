import { describe, it, expect } from 'vitest'
import { safeNextPath } from './next-path'

describe('safeNextPath', () => {
  it('keeps a path on this site', () => {
    expect(safeNextPath('/it/account', '/fallback')).toBe('/it/account')
    expect(safeNextPath('/manage/bookings?week=2', '/fallback')).toBe('/manage/bookings?week=2')
  })

  it('falls back when there is nothing', () => {
    expect(safeNextPath(undefined, '/fallback')).toBe('/fallback')
    expect(safeNextPath(null, '/fallback')).toBe('/fallback')
    expect(safeNextPath('', '/fallback')).toBe('/fallback')
  })

  it('refuses anything that is not a path of this site: the sign-in would send the person elsewhere', () => {
    for (const hostile of [
      'https://elsewhere.com',
      '//elsewhere.com',
      '/' + String.fromCharCode(92) + 'elsewhere.com', // "/\elsewhere.com": browsers read the backslash as a slash
      '@elsewhere.com',
      'javascript:alert(1)',
      'elsewhere.com/it/account',
      ' //elsewhere.com',
    ]) {
      expect(safeNextPath(hostile, '/fallback'), hostile).toBe('/fallback')
    }
  })

  it('refuses a line break or a tab in the path, which some clients drop and then read //host', () => {
    expect(safeNextPath('/\n/elsewhere.com', '/fallback')).toBe('/fallback')
    expect(safeNextPath('/\t/elsewhere.com', '/fallback')).toBe('/fallback')
  })
})
