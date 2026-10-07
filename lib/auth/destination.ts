import { hasAdminRole, type RawAuthUser } from '@/lib/admin-users'
import { safeNextPath } from './next-path'

const LANGUAGES = ['it', 'en', 'de']

/**
 * Where a person goes once they are in: an admin to the panel, anybody else to their account,
 * or where they were going (`next`, a path of this site) when they said so.
 *
 * "Anybody else" is a customer: there is no second role, the absence of the admin one is the
 * customer. It is the safer way round, a mistake here cannot hand the panel to anybody. The
 * role is read from `app_metadata`, which only the service can write, never from `user_metadata`,
 * which the account writes itself (lib/admin-users.ts).
 */
export function destinationFor(
  user: Pick<RawAuthUser, 'app_metadata'>,
  lang: string,
  next?: string | null
): string {
  const language = LANGUAGES.includes(lang) ? lang : 'it'
  const isAdmin = hasAdminRole(user as RawAuthUser)
  const fallback = isAdmin ? '/manage' : `/${language}/account`
  const requested = safeNextPath(next, fallback)
  // The proxy would bounce a customer from the panel back to the sign-in page anyway: do not start the trip.
  if (!isAdmin && (requested === '/manage' || requested.startsWith('/manage/') || requested.startsWith('/manage?'))) return fallback
  return requested
}
