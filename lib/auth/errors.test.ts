import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AUTH_ERROR_CODES, AUTH_INFO_CODES, parseAuthErrorCode, parseAuthInfoCode } from './errors'

const messages = (lang: string) => JSON.parse(readFileSync(join(process.cwd(), 'messages', `${lang}.json`), 'utf8'))

describe('auth codes in the address', () => {
  it('reads a known error code', () => {
    expect(parseAuthErrorCode('invalid_credentials')).toBe('invalid_credentials')
  })

  it('turns anything else into the generic one, instead of printing what the address says', () => {
    // The page used to print `?error=` as it came: any text could be put in front of a visitor.
    expect(parseAuthErrorCode('Your account is locked, call 555-1234')).toBe('generic')
    expect(parseAuthErrorCode(undefined)).toBeNull()
    expect(parseAuthErrorCode('')).toBeNull()
  })

  it('reads an info code, and ignores an unknown one', () => {
    expect(parseAuthInfoCode('signup_sent')).toBe('signup_sent')
    expect(parseAuthInfoCode('whatever')).toBeNull()
    expect(parseAuthInfoCode(undefined)).toBeNull()
  })

  for (const lang of ['it', 'en', 'de']) {
    it(`has a message for every error and info code in ${lang}`, () => {
      const login = messages(lang).login
      for (const code of AUTH_ERROR_CODES) expect(login.errors?.[code], `login.errors.${code}`).toBeTruthy()
      for (const code of AUTH_INFO_CODES) expect(login.info?.[code], `login.info.${code}`).toBeTruthy()
    })
  }
})
