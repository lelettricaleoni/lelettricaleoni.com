import Image from 'next/image'
import { notFound, redirect } from 'next/navigation'
import { getDictionary, hasLocale } from '../dictionaries'
import { Navbar } from '@/components/navbar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updatePasswordAction } from '@/lib/actions/auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseAuthErrorCode } from '@/lib/auth/errors'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

/**
 * The new password, after the link of a reset (the callback has already signed the person in) or from the
 * account page. A server page like the sign-in one, with its texts in messages/*.json: it used to be a
 * client page with a dictionary of its own and a stand-in one for the navigation bar.
 */
export default async function UpdatePasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { lang } = await params
  if (!hasLocale(lang)) notFound()

  // Without a session there is nothing to update: the link of the reset has expired or was never opened.
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${lang}/login?error=invalid_link`)

  const { error } = await searchParams
  const dict = await getDictionary(lang)
  const d = dict.update_password
  const errorCode = parseAuthErrorCode(error)
  const errorMessage = errorCode ? dict.login.errors[errorCode] : null

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar lang={lang} dict={dict} />

      <div className="flex flex-1 pt-16">
        <div className="hidden lg:block lg:w-1/2 relative overflow-hidden">
          <Image src="/images/about.webp" alt="" fill className="object-cover" priority />
          <div className="absolute bottom-12 left-12 right-12 z-10 space-y-3">
            <h2 className="text-3xl font-bold text-white leading-tight drop-shadow-lg whitespace-pre-line">
              {dict.login.left_title}
            </h2>
            <p className="text-white/80 text-sm drop-shadow">{dict.login.gdpr}</p>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-8 bg-background">
          <div className="w-full max-w-sm space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-foreground">{d.title}</h1>
              <p className="text-sm text-muted-foreground mt-1">{d.subtitle}</p>
            </div>

            {errorMessage && (
              <div role="alert" className="p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200">{errorMessage}</div>
            )}

            <form action={updatePasswordAction} className="space-y-4">
              <input type="hidden" name="lang" value={lang} />
              <div className="space-y-1.5">
                <Label htmlFor="password">{d.label}</Label>
                <Input id="password" name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" placeholder="••••••••" />
              </div>
              <Button type="submit" className="w-full">{d.submit}</Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
