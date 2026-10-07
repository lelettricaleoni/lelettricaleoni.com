import { parsePhoneNumberFromString } from 'libphonenumber-js'
import { DEFAULT_PHONE_COUNTRY } from '@/lib/customer'

/**
 * A phone number in the international format (E.164), or null when it is not a valid one.
 * No hand-written regex: libphonenumber-js decides, as everywhere else a phone is read here
 * (lib/customer.ts). A number typed without a prefix is read as Italian.
 */
export function normalisePhone(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const parsed = parsePhoneNumberFromString(raw.trim(), DEFAULT_PHONE_COUNTRY)
  return parsed?.isValid() ? parsed.number : null
}
