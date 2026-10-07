'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { hasAdminRole } from '@/lib/admin-users'
import { destinationFor } from '@/lib/auth/destination'
import { safeNextPath } from '@/lib/auth/next-path'
import { ensureCustomerFor } from '@/lib/auth/ensure-customer'
import { normalisePhone } from '@/lib/auth/phone'
import { GOOGLE_PHONE_SCOPE, REQUEST_GOOGLE_PHONE } from '@/lib/auth/google-phone'
import type { AuthErrorCode, AuthInfoCode } from '@/lib/auth/errors'

/**
 * Signing in, for everybody: an admin lands in the panel, a customer on their account.
 *
 * What goes wrong travels in the address as a CODE (lib/auth/errors.ts), never as a sentence, and the
 * page turns it into the message of its own language. The language comes from the form: it used to be
 * lost, so a reset or a sign-out always sent a German visitor to the Italian page.
 */

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const LANGUAGES = ['it', 'en', 'de']
const MIN_PASSWORD = 8
// Supabase refuses a password over 72 bytes (the limit of the hash it uses).
const MAX_PASSWORD = 72

const langOf = (formData: FormData): string => {
  const lang = formData.get('lang')
  return typeof lang === 'string' && LANGUAGES.includes(lang) ? lang : 'it'
}

/** The page the person was going to, when it is a path of this site; empty otherwise. */
const nextOf = (formData: FormData): string => {
  const next = formData.get('next')
  return typeof next === 'string' ? safeNextPath(next, '') : ''
}

const text = (formData: FormData, name: string): string => {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function loginUrl(lang: string, params: { error?: AuthErrorCode; info?: AuthInfoCode; tab?: string; next?: string }): string {
  const query = new URLSearchParams()
  if (params.error) query.set('error', params.error)
  if (params.info) query.set('info', params.info)
  if (params.tab) query.set('tab', params.tab)
  if (params.next) query.set('next', params.next)
  const qs = query.toString()
  return `/${lang}/login${qs ? `?${qs}` : ''}`
}

/** Where an email link brings the person back to: the language and where they were going. */
function callbackUrl(lang: string, next: string): string {
  const query = new URLSearchParams({ lang })
  if (next) query.set('next', next)
  return `${SITE_URL}/auth/callback?${query.toString()}`
}

const isRateLimit = (error: { status?: number; code?: string }) =>
  error.status === 429 || error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit'

export async function loginAction(formData: FormData) {
  const lang = langOf(formData)
  const next = nextOf(formData)
  const email = text(formData, 'email')
  const password = String(formData.get('password') ?? '')
  if (!email || !password) redirect(loginUrl(lang, { error: 'missing_fields', next }))

  const supabase = await createSupabaseServerClient()
  const { error, data } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.user) {
    const code: AuthErrorCode = error && isRateLimit(error) ? 'rate_limited'
      : error?.code === 'email_not_confirmed' ? 'email_not_confirmed'
      : 'invalid_credentials'
    redirect(loginUrl(lang, { error: code, next }))
  }

  await ensureCustomerFor(data.user)
  redirect(destinationFor(data.user, lang, next))
}

const registerSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.email(),
})

export async function registerAction(formData: FormData) {
  const lang = langOf(formData)
  const next = nextOf(formData)
  const fail = (error: AuthErrorCode) => redirect(loginUrl(lang, { error, tab: 'register', next }))

  const fields = registerSchema.safeParse({
    firstName: text(formData, 'first_name'),
    lastName: text(formData, 'last_name'),
    email: text(formData, 'email').toLowerCase(),
  })
  if (!fields.success) return fail('missing_fields')
  // Optional. Typed in any format, read as Italian when there is no prefix, kept in the international one.
  const rawPhone = text(formData, 'phone')
  const phone = normalisePhone(rawPhone)
  if (rawPhone && !phone) return fail('invalid_phone')
  const password = String(formData.get('password') ?? '')
  if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) return fail('weak_password')
  if (formData.get('consent') !== 'on') return fail('consent_required')

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signUp({
    email: fields.data.email,
    password,
    options: {
      emailRedirectTo: callbackUrl(lang, next),
      // Labels for the customer record. user_metadata is written by the account itself: it is never read
      // for a permission (lib/admin-users.ts).
      data: {
        first_name: fields.data.firstName,
        last_name: fields.data.lastName,
        lang,
        // Not `phone`: Supabase has its own meaning for that. Read when the email is confirmed (lib/auth/ensure-customer.ts).
        ...(phone ? { customer_phone: phone } : {}),
      },
    },
  })
  if (error) {
    return fail(isRateLimit(error) ? 'rate_limited' : error.code === 'weak_password' ? 'weak_password' : 'signup_failed')
  }
  // The same answer whether or not the address already had an account: Supabase does not say.
  redirect(loginUrl(lang, { info: 'signup_sent', next }))
}

export async function magicLinkAction(formData: FormData) {
  const lang = langOf(formData)
  const next = nextOf(formData)
  const email = text(formData, 'email')
  if (!email) redirect(loginUrl(lang, { error: 'missing_fields', tab: 'magic', next }))

  const supabase = await createSupabaseServerClient()
  // shouldCreateUser: false. Signing up is its own, explicit step (it asks for the names and the consent);
  // a magic link for an address nobody registered must not make an account out of it.
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: callbackUrl(lang, next) },
  })
  if (error && isRateLimit(error)) redirect(loginUrl(lang, { error: 'rate_limited', tab: 'magic', next }))
  // Any other answer, including "no such user", is the same one: the page must not say which addresses exist.
  redirect(loginUrl(lang, { info: 'magic_sent', next }))
}

export async function resetPasswordAction(formData: FormData) {
  const lang = langOf(formData)
  const email = text(formData, 'email')
  if (!email) redirect(loginUrl(lang, { error: 'missing_fields', tab: 'reset' }))

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: callbackUrl(lang, `/${lang}/update-password`),
  })
  if (error && isRateLimit(error)) redirect(loginUrl(lang, { error: 'rate_limited', tab: 'reset' }))
  redirect(loginUrl(lang, { info: 'reset_sent' }))
}

export async function updatePasswordAction(formData: FormData) {
  const lang = langOf(formData)
  const password = String(formData.get('password') ?? '')
  const back = (error: AuthErrorCode) => redirect(`/${lang}/update-password?error=${error}`)
  if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) return back('weak_password')

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return back(error.code === 'weak_password' ? 'weak_password' : 'generic')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(loginUrl(lang, { info: 'password_updated' }))
  const destination = destinationFor(user, lang)
  redirect(hasAdminRole(user) ? destination : `${destination}?info=password_updated`)
}

export async function googleLoginAction(formData: FormData) {
  const lang = langOf(formData)
  const next = nextOf(formData)
  // No switch: whether Google sign-in works is whether the Google provider is enabled in the Supabase project. If it is
  // not, Supabase answers with an error and the person lands on the sign-in page with the generic message.
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: callbackUrl(lang, next),
      // The phone is a sensitive scope: see REQUEST_GOOGLE_PHONE.
      ...(REQUEST_GOOGLE_PHONE ? { scopes: GOOGLE_PHONE_SCOPE } : {}),
    },
  })
  if (error || !data.url) redirect(loginUrl(lang, { error: 'generic', next }))
  redirect(data.url)
}

/** Signs out and goes to the sign-in page in the language of the one the person was on (Italian if unknown). */
export async function logoutAction(formData?: FormData) {
  const lang = formData ? langOf(formData) : 'it'
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect(`/${lang}/login`)
}
