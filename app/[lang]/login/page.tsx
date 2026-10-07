import Image from 'next/image'
import { notFound, redirect } from 'next/navigation'
import { getDictionary, hasLocale } from '../dictionaries'
import { Navbar } from '@/components/navbar'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { destinationFor } from '@/lib/auth/destination'
import { safeNextPath } from '@/lib/auth/next-path'
import { parseAuthErrorCode, parseAuthInfoCode } from '@/lib/auth/errors'
import { LoginForm, type LoginTab } from './login-form'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

const TABS: LoginTab[] = ['password', 'magic', 'reset', 'register']

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>
  searchParams: Promise<{ error?: string; info?: string; tab?: string; next?: string }>
}) {
  const { lang } = await params
  if (!hasLocale(lang)) notFound()

  const { error, info, tab, next } = await searchParams
  // Somebody who is already signed in has nothing to do here: take them where they were going.
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect(destinationFor(user, lang, next))

  const dict = await getDictionary(lang)
  const d = dict.login

  // The address carries codes, never sentences: only what lib/auth/errors.ts knows becomes a message.
  const errorCode = parseAuthErrorCode(error)
  const infoCode = parseAuthInfoCode(info)
  const errorMessage = errorCode ? d.errors[errorCode] : null
  const infoMessage = infoCode ? d.info[infoCode] : null

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar lang={lang} dict={dict} />

      <div className="flex flex-1 pt-16">
        {/* Left panel */}
        <div className="hidden lg:block lg:w-1/2 relative overflow-hidden">
          <Image src="/images/about.webp" alt="" fill className="object-cover" priority />
          <div className="absolute bottom-12 left-12 right-12 z-10 space-y-3">
            <h2 className="text-3xl font-bold text-white leading-tight drop-shadow-lg whitespace-pre-line">
              {d.left_title}
            </h2>
            <p className="text-white/80 text-sm drop-shadow">{d.gdpr}</p>
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1 flex items-center justify-center p-8 bg-background">
          <div className="w-full max-w-sm space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-[#1e3a5f]">{d.title}</h1>
              <p className="text-sm text-muted-foreground mt-1">{d.subtitle}</p>
            </div>
            <LoginForm
              lang={lang}
              d={d}
              errorMessage={errorMessage}
              infoMessage={infoMessage}
              initialTab={TABS.includes(tab as LoginTab) ? (tab as LoginTab) : 'password'}
              next={safeNextPath(next, '')}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
