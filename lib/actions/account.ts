'use server'

import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { User } from '@supabase/supabase-js'
import { db, customers } from '@/lib/db'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { hasAdminRole } from '@/lib/admin-users'
import { customerSchema } from '@/lib/customer'
import { ensureCustomerFor } from '@/lib/auth/ensure-customer'
import { buildAccountExport, releaseCustomerOfAccount } from '@/lib/auth/account-data'
import { languageOf, parseLanguage } from '@/lib/auth/language'
import { callbackUrl, isRateLimit, loginUrl } from '@/lib/auth/urls'
import { UNIQUE_VIOLATION, pgErrorCode } from '@/lib/pg-errors'

/**
 * The person's own account, from the settings pages. Every action reads who is asking from the session, never from
 * the form: the only account and customer one of these can touch is the signed-in one.
 */
const SETTINGS = (lang: string) => `/${lang}/account/settings`
const SECURITY = (lang: string) => `${SETTINGS(lang)}/security`
const PRIVACY = (lang: string) => `${SETTINGS(lang)}/privacy`

const langOf = (formData: FormData) => languageOf(formData.get('lang'))
const field = (formData: FormData, name: string) => {
  const value = formData.get(name)
  return typeof value === 'string' ? value : ''
}

async function signedInUser(lang: string, back: string): Promise<User> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${lang}/login?next=${encodeURIComponent(back)}`)
  return user
}

/**
 * First name, last name, phone and language. The email is not here: it is what the account is, and changing it is
 * its own, confirmed step (`changeEmailAction`).
 *
 * The language is the site's language once signed in, so after saving it the person lands on the same page in it.
 */
export async function updateAccountAction(formData: FormData) {
  const lang = langOf(formData)
  const user = await signedInUser(lang, SETTINGS(lang))
  const back = (query: string, to = lang) => redirect(`${SETTINGS(to)}?${query}`)
  if (hasAdminRole(user)) return back('error=save_failed')

  const parsed = customerSchema.safeParse({
    firstName: field(formData, 'first_name'),
    lastName: field(formData, 'last_name'),
    phone: field(formData, 'phone'),
  })
  if (!parsed.success) {
    const onPhone = parsed.error.issues.some((issue) => issue.path[0] === 'phone')
    return back(onPhone ? 'error=invalid_phone' : 'error=missing_name')
  }
  // Kept as it is when the form sends something that is not one of the three: never an error for a language.
  const language = parseLanguage(field(formData, 'language'))

  // A confirmed account that has no customer yet (a first visit that could not link) gets one now.
  await ensureCustomerFor(user)

  try {
    const updated = await db.update(customers)
      .set({
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        phone: parsed.data.phone ?? null,
        ...(language ? { language } : {}),
        updatedAt: new Date(),
      })
      .where(eq(customers.userId, user.id))
      .returning({ id: customers.id })
    if (updated.length === 0) return back('error=save_failed')
  } catch (error) {
    // The phone is unique: the same number is the same person (lib/customers.ts). It belongs to another customer.
    return back(pgErrorCode(error) === UNIQUE_VIOLATION ? 'error=phone_taken' : 'error=save_failed')
  }
  return back('saved=1', language ?? lang)
}

const emailSchema = z.object({ email: z.email() })

/**
 * A new email for the account. Supabase writes the new address only after the person opens the link it sends there,
 * so until then the account keeps the old one; `ensureCustomerFor` moves the customer to the new one on the next visit
 * (lib/auth/customer-link.ts, `syncCustomerEmail`).
 *
 * An address that already has an account gets the same answer as a free one: this page must not tell which
 * addresses are registered.
 */
export async function changeEmailAction(formData: FormData) {
  const lang = langOf(formData)
  const user = await signedInUser(lang, SECURITY(lang))
  const back = (query: string) => redirect(`${SECURITY(lang)}?${query}`)

  const parsed = emailSchema.safeParse({ email: field(formData, 'email').trim().toLowerCase() })
  if (!parsed.success) return back('error=invalid_email')
  if (parsed.data.email === user.email?.toLowerCase()) return back('error=same_email')

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.updateUser(
    { email: parsed.data.email },
    { emailRedirectTo: callbackUrl(lang, `${SECURITY(lang)}?info=email_changed`) },
  )
  if (error && isRateLimit(error)) return back('error=rate_limited')
  if (error && error.code !== 'email_exists') return back('error=email_failed')
  return back('info=email_change_sent')
}

/** Signs out of this device and every other one: the sessions of the account are all closed. */
export async function signOutEverywhereAction(formData: FormData) {
  const lang = langOf(formData)
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut({ scope: 'global' })
  redirect(loginUrl(lang, { info: 'signed_out_everywhere' }))
}

/**
 * Deletes the account. Whoever asks must type their email address, so a click is not enough.
 *
 * The shop's record of the person is released first (lib/auth/account-data.ts: kept when they have rentals,
 * deleted when they have none) and the account after: if the second step fails, the account is still there and
 * the person can sign in and try again, and the record is tied to it again on the next visit.
 * An admin account is not deleted from here: the staff are managed from the panel.
 */
export async function deleteAccountAction(formData: FormData) {
  const lang = langOf(formData)
  const user = await signedInUser(lang, PRIVACY(lang))
  const back = (query: string) => redirect(`${PRIVACY(lang)}?${query}`)
  if (hasAdminRole(user)) return back('error=delete_failed')

  if (field(formData, 'confirm').trim().toLowerCase() !== (user.email ?? '').toLowerCase()) return back('error=confirm_mismatch')

  try {
    await releaseCustomerOfAccount(user.id)
    const { error } = await createSupabaseAdminClient().auth.admin.deleteUser(user.id)
    if (error) throw error
  } catch (error) {
    console.error('[account] could not delete the account:', String(error).replace(/[\r\n]/g, ' '))
    return back('error=delete_failed')
  }

  // The session cookies are still in the browser; the token no longer works, and signing out clears them.
  try {
    const supabase = await createSupabaseServerClient()
    await supabase.auth.signOut()
  } catch {
    // The account is gone either way.
  }
  redirect(loginUrl(lang, { info: 'account_deleted' }))
}

/** A copy of the person's data, as JSON text for the browser to save as a file. */
export async function exportAccountDataAction(): Promise<{ filename: string; json: string } | { error: true }> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: true }
  try {
    const data = await buildAccountExport(user)
    return { filename: `lelettrica-data-${new Date().toISOString().slice(0, 10)}.json`, json: JSON.stringify(data, null, 2) }
  } catch (error) {
    console.error('[account] could not export the data:', String(error).replace(/[\r\n]/g, ' '))
    return { error: true }
  }
}
