import { z } from 'zod'
import { getCountries, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js'

/*
 * Who is renting. First and last name are required; phone, email and notes are optional but,
 * when given, must be real: no hand-written regex, the libraries decide (zod for the email,
 * libphonenumber-js for the phone). Blank optional fields count as missing so a form can send
 * empty strings.
 */

/** A number typed without a country prefix is read in the country the person picked: Italy unless said. */
export const DEFAULT_PHONE_COUNTRY: CountryCode = 'IT'

const countries = getCountries() as [CountryCode, ...CountryCode[]]

const emailCheck = z.email()

const name = (what: string) =>
  z.string().trim().min(1, `${what} is required`).max(80, `${what} is too long`)

const emailField = z.string().trim().transform((value, ctx) => {
  if (!value) return undefined
  const email = value.toLowerCase()
  if (!emailCheck.safeParse(email).success) {
    ctx.addIssue({ code: 'custom', message: 'Email is not valid' })
    return z.NEVER
  }
  return email
})

const notesField = z.string().trim().max(500, 'Notes are too long').transform((value) => value || undefined)

/** What is saved: the phone, when given, is already in the international format. */
export interface CustomerInput {
  firstName: string
  lastName: string
  email?: string
  phone?: string
  notes?: string
}

/**
 * The phone is checked together with the country picked next to it, because only a number
 * without its own prefix depends on the country. It is stored in the international format
 * (E.164), so the same number written two ways is one number; the country is not stored.
 */
export const customerSchema = z.object({
  firstName: name('First name'),
  lastName: name('Last name'),
  email: emailField.optional(),
  phone: z.string().trim().optional(),
  phoneCountry: z.enum(countries).optional(),
  notes: notesField.optional(),
}).transform(({ phone, phoneCountry, ...rest }, ctx): CustomerInput => {
  if (!phone) return rest
  const parsed = parsePhoneNumberFromString(phone, phoneCountry ?? DEFAULT_PHONE_COUNTRY)
  if (!parsed?.isValid()) {
    ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Phone number is not valid' })
    return z.NEVER
  }
  return { ...rest, phone: parsed.number }
})

/** "Mario Rossi". Rentals entered before the split have only a first name; that is still a name. */
export function fullName(firstName: string | null, lastName: string | null): string {
  return [firstName, lastName].map((part) => part?.trim()).filter(Boolean).join(' ')
}
