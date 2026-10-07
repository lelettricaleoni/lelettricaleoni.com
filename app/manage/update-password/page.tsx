import { redirect } from 'next/navigation'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

/**
 * There is one page to set a new password, /[lang]/update-password, for everybody. This was an English-only
 * copy of it for the panel; like /manage/login it now only points there.
 */
export default function ManageUpdatePasswordRedirect() {
  redirect('/it/update-password')
}
