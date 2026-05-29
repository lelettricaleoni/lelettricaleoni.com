import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import Negotiator from 'negotiator'
import { match } from '@formatjs/intl-localematcher'
import { createServerClient } from '@supabase/ssr'

const locales = ['it', 'en', 'de']
const defaultLocale = 'it'

function getLocale(request: NextRequest): string {
  const acceptLanguage = request.headers.get('accept-language') ?? ''
  const headers = { 'accept-language': acceptLanguage }
  const languages = new Negotiator({ headers }).languages()
  try {
    return match(languages, locales, defaultLocale)
  } catch {
    return defaultLocale
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Protezione area admin
  if (pathname.startsWith('/manage')) {
    if (pathname === '/manage/login') {
      return NextResponse.next()
    }

    let supabaseResponse = NextResponse.next({ request })

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return request.cookies.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            supabaseResponse = NextResponse.next({ request })
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()

    if (!user || user.user_metadata?.role !== 'admin') {
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = '/manage/login'
      return NextResponse.redirect(loginUrl)
    }

    return supabaseResponse
  }

  // i18n routing esistente
  const pathnameHasLocale = locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  )

  if (pathnameHasLocale) {
    const locale = pathname.split('/')[1]
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-locale', locale)
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  const locale = getLocale(request)
  request.nextUrl.pathname = `/${locale}${pathname}`
  return NextResponse.redirect(request.nextUrl, 301)
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon\\.ico|icon\\.svg|apple-icon\\.png|opengraph-image|sitemap\\.xml|robots\\.txt|.*\\.pdf$|svg/.*|images/.*).*)',
  ],
}
