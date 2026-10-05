import { getCountries, getCountryCallingCode, type CountryCode } from 'libphonenumber-js'

/** The countries the guests mostly come from, in this order, before the whole list. */
const FIRST: CountryCode[] = ['IT', 'DE', 'AT', 'CH', 'FR', 'NL', 'GB', 'BE', 'PL', 'CZ', 'ES', 'US']

export interface PhoneCountryOption { code: CountryCode; label: string }

/**
 * The choices next to a phone field: "Italy +39". Names come from `Intl.DisplayNames` and the codes
 * from libphonenumber-js, so nothing here is a table to keep up to date by hand.
 */
export function phoneCountryOptions(): PhoneCountryOption[] {
  const names = new Intl.DisplayNames('en', { type: 'region' })
  const option = (code: CountryCode): PhoneCountryOption => ({
    code, label: `${names.of(code) ?? code} +${getCountryCallingCode(code)}`,
  })
  const rest = getCountries()
    .filter((code) => !FIRST.includes(code))
    .map(option)
    .sort((a, b) => a.label.localeCompare(b.label, 'en'))
  return [...FIRST.map(option), ...rest]
}
