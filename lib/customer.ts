import { z } from 'zod'
import { parsePhoneNumberFromString } from 'libphonenumber-js'

/*
 * Who is renting. First and last name are required; phone, email and notes are optional but,
 * when given, must be real: no hand-written regex, the libraries decide (zod for the email,
 * libphonenumber-js for the phone). Blank optional fields count as missing so a form can send
 * empty strings.
 */

/** A number typed without a country code is read as Italian. */
const DEFAULT_COUNTRY = 'IT'

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

/** Stored in the international format (E.164), so the same number written two ways is one number. */
const phoneField = z.string().trim().transform((value, ctx) => {
  if (!value) return undefined
  const phone = parsePhoneNumberFromString(value, DEFAULT_COUNTRY)
  if (!phone?.isValid()) {
    ctx.addIssue({ code: 'custom', message: 'Phone number is not valid' })
    return z.NEVER
  }
  return phone.number
})

const notesField = z.string().trim().max(500, 'Notes are too long').transform((value) => value || undefined)

export const customerShape = {
  firstName: name('First name'),
  lastName: name('Last name'),
  email: emailField.optional(),
  phone: phoneField.optional(),
  notes: notesField.optional(),
}

export const customerSchema = z.object(customerShape)
export type CustomerInput = z.infer<typeof customerSchema>

/** "Mario Rossi". Rentals entered before the split have only a first name; that is still a name. */
export function fullName(firstName: string | null, lastName: string | null): string {
  return [firstName, lastName].map((part) => part?.trim()).filter(Boolean).join(' ')
}
