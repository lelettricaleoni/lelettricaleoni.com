import { normalisePhone } from './phone'

/**
 * The phone number of a Google account, to pre-fill the field on the customer's record.
 *
 * Google gives it only to an app that asked for the scope `user.phonenumbers.read`, which is a
 * SENSITIVE scope: until Google has verified the app, everybody who signs in sees a warning screen
 * and the app is capped at 100 users (see the slice 2 spec, "Rilascio"). So the scope is requested
 * only once `REQUEST_GOOGLE_PHONE` is true.
 *
 * And even then most accounts have no phone to give: the People API returns nothing when the profile
 * has none, and never returns the recovery or 2-step-verification number. So a missing phone is the
 * normal case, never an error, and a failure here must never stop a sign-in.
 *
 * The token is the one Google hands over once, at sign-in. It is used here and not stored.
 */
/**
 * Whether to ask Google for the phone. **Leave false until Google has approved the app's verification**
 * (docs/google-login-setup.md, phase 2), then change it to true in a commit: a decision taken once, in the code,
 * and not an environment switch that can differ between machines.
 */
export const REQUEST_GOOGLE_PHONE = false

/** Added to the three basic scopes Supabase always asks for. */
export const GOOGLE_PHONE_SCOPE = 'https://www.googleapis.com/auth/user.phonenumbers.read'

const PEOPLE_URL = 'https://people.googleapis.com/v1/people/me?personFields=phoneNumbers'
const TIMEOUT_MS = 3000

interface GooglePhoneNumber {
  value?: unknown
  canonicalForm?: unknown
  type?: unknown
}

/** A mobile number first, then the first one that is valid; in the international format, or null. */
export function pickGooglePhone(numbers: unknown): string | null {
  if (!Array.isArray(numbers)) return null
  const entries = numbers.filter((n): n is GooglePhoneNumber => typeof n === 'object' && n !== null)
  const ordered = [...entries.filter((n) => n.type === 'mobile'), ...entries.filter((n) => n.type !== 'mobile')]
  for (const entry of ordered) {
    const phone = normalisePhone(entry.canonicalForm) ?? normalisePhone(entry.value)
    if (phone) return phone
  }
  return null
}

export async function fetchGooglePhone(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (!accessToken) return null
  try {
    const response = await fetchImpl(PEOPLE_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) return null
    const body = (await response.json()) as { phoneNumbers?: unknown }
    return pickGooglePhone(body?.phoneNumbers)
  } catch {
    return null
  }
}
