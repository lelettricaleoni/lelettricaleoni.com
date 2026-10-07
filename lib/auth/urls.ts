import type { AuthErrorCode, AuthInfoCode } from './errors'

/**
 * The addresses the sign-in actions send people to, and the one an email link comes back through. Kept out of
 * the `'use server'` files: everything those export is a Server Action, callable from the browser.
 */
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')

export function loginUrl(lang: string, params: { error?: AuthErrorCode; info?: AuthInfoCode; tab?: string; next?: string }): string {
  const query = new URLSearchParams()
  if (params.error) query.set('error', params.error)
  if (params.info) query.set('info', params.info)
  if (params.tab) query.set('tab', params.tab)
  if (params.next) query.set('next', params.next)
  const qs = query.toString()
  return `/${lang}/login${qs ? `?${qs}` : ''}`
}

/** Where an email link brings the person back to: the language and where they were going. */
export function callbackUrl(lang: string, next: string): string {
  const query = new URLSearchParams({ lang })
  if (next) query.set('next', next)
  return `${SITE_URL}/auth/callback?${query.toString()}`
}

export const isRateLimit = (error: { status?: number; code?: string }) =>
  error.status === 429 || error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit'
