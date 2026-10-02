import { describe, expect, it } from 'vitest'
import { customerSchema, fullName } from './customer'

const base = { firstName: 'Mario', lastName: 'Rossi', phone: '347 123 4567' }

describe('customerSchema', () => {
  it('accepts a name with a phone, and normalises the phone to the international format', () => {
    expect(customerSchema.parse(base).phone).toBe('+393471234567')
  })

  it('reads a number without a country code as Italian and keeps a foreign one as it is', () => {
    expect(customerSchema.parse({ ...base, phone: '+49 151 23456789' }).phone).toBe('+4915123456789')
  })

  it('reads a number without a prefix in the country of the phone, which the person picks', () => {
    expect(customerSchema.parse({ ...base, phone: '0151 23456789', phoneCountry: 'DE' }).phone).toBe('+4915123456789')
    expect(customerSchema.parse({ ...base, phone: '347 123 4567', phoneCountry: 'IT' }).phone).toBe('+393471234567')
  })

  it('lets a number with its own prefix win over the chosen country, and never stores the country', () => {
    const parsed = customerSchema.parse({ ...base, phone: '+49 151 23456789', phoneCountry: 'IT' })
    expect(parsed.phone).toBe('+4915123456789')
    expect('phoneCountry' in parsed).toBe(false)
  })

  it('rejects a country that does not exist', () => {
    expect(customerSchema.safeParse({ ...base, phoneCountry: 'XX' }).success).toBe(false)
  })

  it('rejects a phone number that cannot exist, naming the field', () => {
    const result = customerSchema.safeParse({ ...base, phone: '12345' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]).toMatchObject({ path: ['phone'], message: 'Phone number is not valid' })
  })

  it('accepts an email instead of a phone, lowercased and trimmed', () => {
    const parsed = customerSchema.parse({ firstName: 'Mario', lastName: 'Rossi', email: '  Mario.Rossi@Example.COM ' })
    expect(parsed.email).toBe('mario.rossi@example.com')
    expect(parsed.phone).toBeUndefined()
  })

  it('rejects an email that is not one', () => {
    const result = customerSchema.safeParse({ ...base, email: 'mario@' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]).toMatchObject({ path: ['email'], message: 'Email is not valid' })
  })

  it('needs only the first and last name: phone and email are optional', () => {
    const parsed = customerSchema.parse({ firstName: 'Mario', lastName: 'Rossi' })
    expect(parsed).toMatchObject({ firstName: 'Mario', lastName: 'Rossi' })
    expect(parsed.phone).toBeUndefined()
    expect(parsed.email).toBeUndefined()
  })

  it('treats blank optional fields as missing, so a form can send empty strings', () => {
    const parsed = customerSchema.parse({ ...base, email: '  ', notes: '' })
    expect(parsed.email).toBeUndefined()
    expect(parsed.notes).toBeUndefined()
  })

  it('needs a first name and a last name, trimmed', () => {
    expect(customerSchema.safeParse({ ...base, firstName: '   ' }).success).toBe(false)
    expect(customerSchema.safeParse({ ...base, lastName: '' }).success).toBe(false)
    expect(customerSchema.parse({ ...base, firstName: '  Élodie ' }).firstName).toBe('Élodie')
  })

  it('limits the length of names and notes', () => {
    expect(customerSchema.safeParse({ ...base, firstName: 'a'.repeat(81) }).success).toBe(false)
    expect(customerSchema.safeParse({ ...base, notes: 'a'.repeat(501) }).success).toBe(false)
  })
})

describe('fullName', () => {
  it('joins first and last name, and copes with a missing last name (rentals entered before the split)', () => {
    expect(fullName('Mario', 'Rossi')).toBe('Mario Rossi')
    expect(fullName('Rossi', null)).toBe('Rossi')
    expect(fullName(' Mario ', ' Rossi ')).toBe('Mario Rossi')
  })
})
