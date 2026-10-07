/**
 * What the sign-in pages say went wrong, as CODES in the address (`?error=invalid_credentials`)
 * and not as sentences. The page used to print `?error=` exactly as it came, in Italian whatever
 * the language, and any text put there reached a visitor as if the site had said it. Now only a
 * code this file knows is turned into a message, from messages/*.json, in the language of the
 * page; anything else is the generic one.
 */
export const AUTH_ERROR_CODES = [
  'invalid_credentials',
  'email_not_confirmed',
  'invalid_link',
  'weak_password',
  'missing_fields',
  'consent_required',
  'invalid_phone',
  'rate_limited',
  'signup_failed',
  'generic',
] as const

export const AUTH_INFO_CODES = ['magic_sent', 'reset_sent', 'signup_sent', 'password_updated'] as const

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number]
export type AuthInfoCode = (typeof AUTH_INFO_CODES)[number]

/** null when there is no error to show; `generic` when the address carries something unknown. */
export function parseAuthErrorCode(value: string | null | undefined): AuthErrorCode | null {
  if (!value) return null
  return (AUTH_ERROR_CODES as readonly string[]).includes(value) ? (value as AuthErrorCode) : 'generic'
}

export function parseAuthInfoCode(value: string | null | undefined): AuthInfoCode | null {
  return (AUTH_INFO_CODES as readonly string[]).includes(value ?? '') ? (value as AuthInfoCode) : null
}
