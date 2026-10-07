import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { EmailOtpType } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { hasAdminRole } from '@/lib/admin-users'
import { destinationFor } from '@/lib/auth/destination'
import { ensureCustomerFor } from '@/lib/auth/ensure-customer'
import { fetchGooglePhone } from '@/lib/auth/google-phone'

/** The one-time-token types an email from this site can carry. */
const OTP_TYPES: EmailOtpType[] = ['invite', 'recovery', 'magiclink', 'signup', 'email', 'email_change']
const LANGUAGES = ['it', 'en', 'de']

function isOtpType(value: string | null): value is EmailOtpType {
  return value !== null && (OTP_TYPES as string[]).includes(value)
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const requestedLang = searchParams.get('lang')
  const lang = requestedLang && LANGUAGES.includes(requestedLang) ? requestedLang : 'it'
  // `next` is glued to the origin, and destinationFor only lets a path of this site through: see
  // lib/auth/next-path.ts. It also keeps a customer out of the panel.
  const next = searchParams.get('next')

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )

  // Two shapes arrive here. A sign-in, sign-up or password reset starts in this app, so it uses PKCE and
  // comes back with `code`. An invitation cannot: the browser that sends it is not the browser that
  // accepts it, so PKCE does not apply and the link carries a one-time token instead. Handling only the
  // first would turn every invitation into "link not valid".
  // The token Google hands over at sign-in exists only in this response: it is used for the phone and dropped.
  let googleToken: string | null = null
  const verified = code
    ? await (async () => {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error && process.env.GOOGLE_LOGIN_PHONE === 'true') googleToken = data.session?.provider_token ?? null
        return !error
      })()
    : tokenHash && isOtpType(type)
      ? !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error
      : false

  if (verified) {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      // Anybody who proved their email is in: an admin goes to the panel, a customer to their account.
      // The role is read from app_metadata, which only the service role can write; reading it from
      // user_metadata, which the account writes itself, would accept a role it gave itself.
      if (!hasAdminRole(user)) {
        await ensureCustomerFor(user, { phone: googleToken ? await fetchGooglePhone(googleToken) : null })
      }
      return NextResponse.redirect(`${origin}${destinationFor(user, lang, next)}`)
    }
  }

  return NextResponse.redirect(`${origin}/${lang}/login?error=invalid_link`)
}
