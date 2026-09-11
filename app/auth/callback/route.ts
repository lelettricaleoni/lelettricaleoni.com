import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { EmailOtpType } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { hasAdminRole } from '@/lib/admin-users'

/** The one-time-token types an email from this site can carry. */
const OTP_TYPES: EmailOtpType[] = ['invite', 'recovery', 'magiclink', 'signup', 'email', 'email_change']

function isOtpType(value: string | null): value is EmailOtpType {
  return value !== null && (OTP_TYPES as string[]).includes(value)
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  // `next` is glued to the origin, so it must be a path on this site: an
  // "@elsewhere.com" would make the origin read as credentials and send the
  // freshly signed-in admin to another host, and "//elsewhere.com" would do
  // the same through a protocol-relative URL.
  const requested = searchParams.get('next')
  const next = requested?.startsWith('/') && !requested.startsWith('//') && !requested.startsWith('/\\')
    ? requested
    : '/manage/routes'

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

  // Two shapes arrive here. A password reset starts in this app, so it uses
  // PKCE and comes back with `code`. An invitation cannot: the browser that
  // sends it is not the browser that accepts it, so PKCE does not apply and
  // the link carries a one-time token instead. Handling only the first would
  // turn every invitation into "link non valido".
  const verified = code
    ? !(await supabase.auth.exchangeCodeForSession(code)).error
    : tokenHash && isOtpType(type)
      ? !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error
      : false

  if (verified) {
    const { data: { user } } = await supabase.auth.getUser()
    // The role is read from app_metadata, which only the service role can
    // write. Reading it from user_metadata — as this route used to — would
    // have accepted a role the account had set on itself.
    if (!user || !hasAdminRole(user)) {
      await supabase.auth.signOut()
      return NextResponse.redirect(`${origin}/login?error=Accesso+non+autorizzato.`)
    }
    return NextResponse.redirect(`${origin}${next}`)
  }

  return NextResponse.redirect(`${origin}/login?error=Link+non+valido+o+scaduto.`)
}
