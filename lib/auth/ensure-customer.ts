import type { User } from '@supabase/supabase-js'
import { hasAdminRole } from '@/lib/admin-users'
import { linkCustomerToAccount } from './customer-link'
import { namesFromAccount } from './identity'
import { normalisePhone } from './phone'

/**
 * Makes sure a customer account has its customer record (lib/auth/customer-link.ts). A failure here must
 * never keep a person out: they are signed in, and the account page tries again.
 *
 * `offered.phone` is a number the sign-in provider gave (Google, lib/auth/google-phone.ts).
 *
 * Not in lib/actions/auth.ts on purpose: every function a "use server" file exports is a Server Action,
 * callable from the browser by anyone with arguments of their choice. This one takes a user and writes to
 * `customers`; it may only ever be called by code that has just verified that user itself.
 */
export async function ensureCustomerFor(user: User, offered: { phone?: string | null } = {}): Promise<void> {
  if (hasAdminRole(user)) return
  try {
    await linkCustomerToAccount({
      userId: user.id,
      email: user.email,
      emailConfirmed: Boolean(user.email_confirmed_at),
      ...namesFromAccount(user),
      // The phone typed in the sign-up form wins over the one Google offers. Both are only offers:
      // lib/auth/customer-link.ts uses one only where the customer has none.
      phone: normalisePhone(user.user_metadata?.customer_phone) ?? offered.phone,
    })
  } catch (error) {
    console.error('[auth] could not link the account to a customer:', String(error).replace(/[\r\n]/g, ' '))
  }
}
