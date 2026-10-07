/**
 * First and last name of an account, for the customer record it becomes.
 *
 * They come from `user_metadata`: the sign-up form sends `first_name` and `last_name`, Google sends
 * `given_name` and `family_name` (and `full_name`), and an account made with a magic link has none.
 * A customer must have a first name, so the last resort is the part of the email before the "@".
 *
 * `user_metadata` is written by the account itself: these are labels to show and nothing more, never
 * something to base a permission on (the role is in `app_metadata`, lib/admin-users.ts).
 */
export interface AccountForNames {
  email?: string | null
  user_metadata?: Record<string, unknown> | null
}

const MAX_NAME = 80 // the same limit lib/customer.ts puts on the shop's own forms

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')
const cut = (value: string) => value.slice(0, MAX_NAME)

export function namesFromAccount(account: AccountForNames): { firstName: string; lastName: string } {
  const meta = account.user_metadata ?? {}

  let firstName = text(meta.first_name) || text(meta.given_name)
  let lastName = text(meta.last_name) || text(meta.family_name)

  if (!firstName) {
    const full = text(meta.full_name) || text(meta.name)
    if (full) {
      const space = full.indexOf(' ')
      firstName = space === -1 ? full : full.slice(0, space)
      if (!lastName && space !== -1) lastName = full.slice(space + 1).trim()
    }
  }
  if (!firstName) firstName = (account.email ?? '').split('@')[0]

  return { firstName: cut(firstName), lastName: cut(lastName) }
}
