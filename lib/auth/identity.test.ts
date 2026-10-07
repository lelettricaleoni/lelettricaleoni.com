import { describe, it, expect } from 'vitest'
import { namesFromAccount } from './identity'

describe('namesFromAccount', () => {
  it('takes the names the sign-up form sent', () => {
    expect(namesFromAccount({ email: 'mario@example.com', user_metadata: { first_name: 'Mario', last_name: 'Rossi' } }))
      .toEqual({ firstName: 'Mario', lastName: 'Rossi' })
  })

  it('takes the names Google sends', () => {
    expect(namesFromAccount({ email: 'g@example.com', user_metadata: { given_name: 'Giulia', family_name: 'Verdi' } }))
      .toEqual({ firstName: 'Giulia', lastName: 'Verdi' })
  })

  it('splits a full name at the first space: the rest is the last name', () => {
    expect(namesFromAccount({ email: 'a@example.com', user_metadata: { full_name: 'Anna Maria De Luca' } }))
      .toEqual({ firstName: 'Anna', lastName: 'Maria De Luca' })
    expect(namesFromAccount({ email: 'a@example.com', user_metadata: { name: 'Cher' } }))
      .toEqual({ firstName: 'Cher', lastName: '' })
  })

  it('falls back to the part of the email before the @, so a customer is never nameless', () => {
    expect(namesFromAccount({ email: 'luca.bianchi@example.com', user_metadata: {} }))
      .toEqual({ firstName: 'luca.bianchi', lastName: '' })
    expect(namesFromAccount({ email: 'luca@example.com' })).toEqual({ firstName: 'luca', lastName: '' })
  })

  it('trims, and cuts what is too long for a customer record', () => {
    const result = namesFromAccount({ email: 'x@example.com', user_metadata: { first_name: '  Mario  ', last_name: 'R'.repeat(200) } })
    expect(result.firstName).toBe('Mario')
    expect(result.lastName).toHaveLength(80)
  })

  it('ignores a value that is not text', () => {
    expect(namesFromAccount({ email: 'x@example.com', user_metadata: { first_name: 42, last_name: { a: 1 } } }))
      .toEqual({ firstName: 'x', lastName: '' })
  })
})
