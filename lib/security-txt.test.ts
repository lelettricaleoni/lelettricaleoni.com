import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { config } from '../proxy'

// RFC 9116: https://www.rfc-editor.org/rfc/rfc9116
const file = readFileSync(join(process.cwd(), 'public', '.well-known', 'security.txt'), 'utf8')
const field = (name: string) => file.split(/\r?\n/).find((line) => line.startsWith(`${name}:`))?.slice(name.length + 1).trim()

describe('public/.well-known/security.txt', () => {
  it('has the two fields the standard requires: Contact and Expires', () => {
    expect(field('Contact'), 'Contact manca').toBeTruthy()
    expect(field('Expires'), 'Expires manca').toBeTruthy()
  })

  it('points to the security alias, never to a person or to the shop inbox', () => {
    expect(field('Contact')).toBe('mailto:security@lelettricaleoni.com')
  })

  it('is not expired, and does not promise more than a year', () => {
    const expires = new Date(field('Expires')!)
    expect(Number.isNaN(expires.getTime()), 'Expires non è una data').toBe(false)
    const now = Date.now()
    // An expired security.txt is worse than none: researchers are told to distrust it.
    expect(expires.getTime(), 'security.txt scaduto: rinnova Expires (docs/contact-details.md)').toBeGreaterThan(now)
    expect(expires.getTime() - now, 'Expires oltre un anno: lo standard lo sconsiglia').toBeLessThan(366 * 24 * 3600 * 1000)
  })

  it('names itself, so a copy elsewhere can be told from the real one', () => {
    expect(field('Canonical')).toBe('https://www.lelettricaleoni.com/.well-known/security.txt')
  })

  it('is not behind the locale redirect', () => {
    // /.well-known/security.txt used to be sent to /it/.well-known/security.txt, which was a 404 page.
    const pattern = new RegExp(`^${config.matcher[0]}$`)
    expect(pattern.test('/.well-known/security.txt')).toBe(false)
    expect(pattern.test('/bikes')).toBe(true)
  })
})
