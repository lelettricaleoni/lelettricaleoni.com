import { describe, it, expect, vi } from 'vitest'
import { normalisePhone } from './phone'
import { fetchGooglePhone, pickGooglePhone } from './google-phone'

describe('normalisePhone', () => {
  it('writes a valid number in the international format, reading one without a prefix as Italian', () => {
    expect(normalisePhone('347 123 4567')).toBe('+393471234567')
    expect(normalisePhone('+39 347 123 4567')).toBe('+393471234567')
    expect(normalisePhone('+49 151 23456789')).toBe('+4915123456789')
  })

  it('is null for what is not a phone number, instead of storing it', () => {
    expect(normalisePhone('abc')).toBeNull()
    expect(normalisePhone('123')).toBeNull()
    expect(normalisePhone('')).toBeNull()
    expect(normalisePhone('   ')).toBeNull()
    expect(normalisePhone(undefined)).toBeNull()
    expect(normalisePhone(42 as unknown as string)).toBeNull()
  })
})

describe('pickGooglePhone', () => {
  it('prefers a mobile number, then the first one', () => {
    expect(pickGooglePhone([{ value: '0464 123456', type: 'home' }, { value: '347 123 4567', type: 'mobile' }])).toBe('+393471234567')
    expect(pickGooglePhone([{ value: '347 123 4567' }, { value: '348 765 4321' }])).toBe('+393471234567')
  })

  it('uses the canonical form Google gives, when there is one', () => {
    expect(pickGooglePhone([{ value: '(0151) 2345-6789', canonicalForm: '+4915123456789' }])).toBe('+4915123456789')
  })

  it('skips a number that is not valid and takes the next', () => {
    expect(pickGooglePhone([{ value: 'ext. 12' }, { value: '347 123 4567' }])).toBe('+393471234567')
  })

  it('is null when there is nothing usable', () => {
    expect(pickGooglePhone(undefined)).toBeNull()
    expect(pickGooglePhone([])).toBeNull()
    expect(pickGooglePhone('not a list')).toBeNull()
    expect(pickGooglePhone([{ type: 'mobile' }, null, 7])).toBeNull()
  })
})

describe('fetchGooglePhone', () => {
  const answer = (body: unknown, ok = true) => vi.fn(async () => ({ ok, json: async () => body }) as Response)

  it('asks the People API with the token and returns the number', async () => {
    const fetchImpl = answer({ phoneNumbers: [{ value: '347 123 4567', type: 'mobile' }] })
    expect(await fetchGooglePhone('token-123', fetchImpl)).toBe('+393471234567')
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('people.googleapis.com/v1/people/me')
    expect(url).toContain('personFields=phoneNumbers')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-123')
  })

  it('is null when the profile has no phone: Google returns nothing for most accounts', async () => {
    expect(await fetchGooglePhone('t', answer({ resourceName: 'people/1' }))).toBeNull()
  })

  it('is null when Google refuses (scope not granted, token expired), without throwing', async () => {
    expect(await fetchGooglePhone('t', answer({ error: { code: 403 } }, false))).toBeNull()
  })

  it('is null when the network fails: a phone is a convenience, it must never stop a sign-in', async () => {
    const failing = vi.fn(async () => { throw new Error('network down') })
    expect(await fetchGooglePhone('t', failing)).toBeNull()
  })

  it('does nothing without a token', async () => {
    const fetchImpl = answer({})
    expect(await fetchGooglePhone('', fetchImpl)).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
