import { describe, it, expect } from 'vitest'
import { destinationFor } from './destination'

const admin = { app_metadata: { role: 'admin' } }
const customer = { app_metadata: {} }

describe('destinationFor', () => {
  it('takes an admin to the panel and a customer to the account, in the language of the page', () => {
    expect(destinationFor(admin, 'it')).toBe('/manage')
    expect(destinationFor(customer, 'it')).toBe('/it/account/settings')
    expect(destinationFor(customer, 'de')).toBe('/de/account/settings')
  })

  it('takes anybody without a role to the account: no role is a customer, never an admin', () => {
    expect(destinationFor({ app_metadata: null }, 'en')).toBe('/en/account/settings')
    expect(destinationFor({}, 'en')).toBe('/en/account/settings')
    // user_metadata is written by the account itself: it must never make an admin.
    expect(destinationFor({ app_metadata: {}, user_metadata: { role: 'admin' } } as never, 'en')).toBe('/en/account/settings')
  })

  it('goes where the person was going, when that is a path of this site', () => {
    expect(destinationFor(customer, 'it', '/it/prenota')).toBe('/it/prenota')
    expect(destinationFor(admin, 'it', '/manage/bookings')).toBe('/manage/bookings')
  })

  it('ignores a next that leaves the site', () => {
    expect(destinationFor(customer, 'it', 'https://elsewhere.com')).toBe('/it/account/settings')
    expect(destinationFor(admin, 'it', '//elsewhere.com')).toBe('/manage')
  })

  it('never sends a customer into the panel, whatever next says', () => {
    expect(destinationFor(customer, 'it', '/manage')).toBe('/it/account/settings')
    expect(destinationFor(customer, 'it', '/manage/bookings')).toBe('/it/account/settings')
    expect(destinationFor(customer, 'en', '/manage?x=1')).toBe('/en/account/settings')
    // an admin may go there
    expect(destinationFor(admin, 'it', '/manage/bookings')).toBe('/manage/bookings')
  })

  it('falls back to Italian for a language the site does not have', () => {
    expect(destinationFor(customer, 'fr')).toBe('/it/account/settings')
  })
})
