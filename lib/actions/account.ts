'use server'

import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db, customers } from '@/lib/db'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { hasAdminRole } from '@/lib/admin-users'
import { customerSchema } from '@/lib/customer'
import { ensureCustomerFor } from '@/lib/auth/ensure-customer'
import { UNIQUE_VIOLATION, pgErrorCode } from '@/lib/pg-errors'

const LANGUAGES = ['it', 'en', 'de']

/**
 * The person's own details: first name, last name, phone. The email is not editable here: it is what the
 * account is, and changing it is a different, confirmed step (not in this slice).
 *
 * Reads who is asking from the session, never from the form: the only customer this can touch is the one tied
 * to the signed-in account.
 */
export async function updateAccountAction(formData: FormData) {
  const rawLang = formData.get('lang')
  const lang = typeof rawLang === 'string' && LANGUAGES.includes(rawLang) ? rawLang : 'it'
  const back = (query: string) => redirect(`/${lang}/account?${query}`)

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${lang}/login?next=${encodeURIComponent(`/${lang}/account`)}`)
  if (hasAdminRole(user)) return back('error=save_failed')

  const field = (name: string) => {
    const value = formData.get(name)
    return typeof value === 'string' ? value : ''
  }
  const parsed = customerSchema.safeParse({
    firstName: field('first_name'),
    lastName: field('last_name'),
    phone: field('phone'),
  })
  if (!parsed.success) {
    const onPhone = parsed.error.issues.some((issue) => issue.path[0] === 'phone')
    return back(onPhone ? 'error=invalid_phone' : 'error=missing_name')
  }

  // A confirmed account that has no customer yet (a first visit that could not link) gets one now.
  await ensureCustomerFor(user)

  try {
    const updated = await db.update(customers)
      .set({
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        phone: parsed.data.phone ?? null,
        updatedAt: new Date(),
      })
      .where(eq(customers.userId, user.id))
      .returning({ id: customers.id })
    if (updated.length === 0) return back('error=save_failed')
  } catch (error) {
    // The phone is unique: the same number is the same person (lib/customers.ts). It belongs to another customer.
    return back(pgErrorCode(error) === UNIQUE_VIOLATION ? 'error=phone_taken' : 'error=save_failed')
  }
  return back('saved=1')
}
