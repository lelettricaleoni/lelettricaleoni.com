import type { User } from '@supabase/supabase-js'
import { hasAdminRole } from '@/lib/admin-users'
import { linkCustomerToAccount, syncCustomerEmail } from './customer-link'
import { namesFromAccount } from './identity'
import { parseLanguage } from './language'

/**
 * Makes sure a customer account has its customer record (lib/auth/customer-link.ts). A failure here must
 * never keep a person out: they are signed in, and the account page tries again.
 *
 * `offered.phone` is a number the sign-in provider gave (Google, lib/auth/google-phone.ts); `offered.language` the language the person was visiting in.
 *
 * Not in lib/actions/auth.ts on purpose: every function a "use server" file exports is a Server Action,
 * callable from the browser by anyone with arguments of their choice. This one takes a user and writes to
 * `customers`; it may only ever be called by code that has just verified that user itself.
 */
export async function ensureCustomerFor(user: User, offered: { phone?: string | null; language?: string | null } = {}): Promise<void> {
  if (hasAdminRole(user)) return
  try {
    await linkCustomerToAccount({
      userId: user.id,
      email: user.email,
      emailConfirmed: Boolean(user.email_confirmed_at),
      ...namesFromAccount(user),
      // The phone is not asked at sign-up (it is in the account settings); the only one that can arrive here is the one
      // Google offers, and it is an offer: lib/auth/customer-link.ts uses it only where the customer has none.
      phone: offered.phone,
      // The language of the sign-up form wins; Google has none to send, so the one the person was visiting in is offered.
      language: parseLanguage(user.user_metadata?.lang) ?? offered.language,
    })
    // An email changed in the account settings arrives here, the first time the person comes back confirmed.
    if (user.email_confirmed_at) await syncCustomerEmail(user.id, user.email)
  } catch (error) {
    console.error('[auth] could not link the account to a customer:', String(error).replace(/[\r\n]/g, ' '))
  }
}
