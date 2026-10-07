import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getDictionary, hasLocale } from '../dictionaries'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { db, customers } from '@/lib/db'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { hasAdminRole } from '@/lib/admin-users'
import { ensureCustomerFor } from '@/lib/auth/ensure-customer'
import { logoutAction } from '@/lib/actions/auth'
import { updateAccountAction } from '@/lib/actions/account'

const ERROR_CODES = ['missing_name', 'invalid_phone', 'phone_taken', 'save_failed'] as const
type ErrorCode = (typeof ERROR_CODES)[number]

/**
 * The person's account: their details, a way to change the password, and (from slice 3) their online
 * bookings. For now the bookings are an honest "none yet": there is no online booking to show.
 * Only online bookings will ever be listed, never the rentals the shop registered at the counter, even for
 * the same person (STATE.md, "Clienti e importi").
 *
 * Signed in or not is decided here as well as in the proxy: the proxy also refreshes the session, which a
 * page cannot do (it cannot set cookies), and this is the check that does not depend on it.
 */
export default async function AccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>
  searchParams: Promise<{ error?: string; saved?: string; info?: string }>
}) {
  const { lang } = await params
  if (!hasLocale(lang)) notFound()

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${lang}/login?next=${encodeURIComponent(`/${lang}/account`)}`)

  const isAdmin = hasAdminRole(user)
  // The record normally exists from the first sign-in; this covers one that could not be made then.
  if (!isAdmin) await ensureCustomerFor(user)
  const [customer] = isAdmin ? [] : await db.select().from(customers).where(eq(customers.userId, user.id))

  const { error, saved, info } = await searchParams
  const dict = await getDictionary(lang)
  const d = dict.account
  const errorMessage = (ERROR_CODES as readonly string[]).includes(error ?? '') ? d.errors[error as ErrorCode] : null

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar lang={lang} dict={dict} />

      <main className="flex-1 pt-24 pb-16">
        <div className="max-w-2xl mx-auto px-6 space-y-10">
          <div>
            <h1 className="text-3xl font-bold text-[#1e3a5f]">{d.title}</h1>
            <p className="text-muted-foreground mt-1">{d.subtitle}</p>
          </div>

          {errorMessage && (
            <div role="alert" className="p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200">{errorMessage}</div>
          )}
          {saved === '1' && (
            <div role="status" className="p-3 bg-green-50 text-green-700 rounded-lg text-sm border border-green-200">{d.saved}</div>
          )}
          {info === 'password_updated' && (
            <div role="status" className="p-3 bg-green-50 text-green-700 rounded-lg text-sm border border-green-200">{dict.login.info.password_updated}</div>
          )}

          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-[#1e3a5f]">{d.profile_title}</h2>
            <form action={updateAccountAction} className="space-y-4">
              <input type="hidden" name="lang" value={lang} />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="first_name">{d.first_name_label}</Label>
                  <Input id="first_name" name="first_name" required maxLength={80} defaultValue={customer?.firstName ?? ''} disabled={isAdmin} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="last_name">{d.last_name_label}</Label>
                  <Input id="last_name" name="last_name" required maxLength={80} defaultValue={customer?.lastName ?? ''} disabled={isAdmin} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">{d.email_label}</Label>
                <Input id="email" value={user.email ?? ''} readOnly disabled />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">{d.phone_label}</Label>
                <Input id="phone" name="phone" type="tel" autoComplete="tel" defaultValue={customer?.phone ?? ''} disabled={isAdmin} />
                <p className="text-xs text-muted-foreground">{d.phone_hint}</p>
              </div>
              {!isAdmin && <Button type="submit" className="bg-[#1e3a5f] hover:bg-[#152c4a]">{d.save}</Button>}
            </form>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[#1e3a5f]">{d.password_title}</h2>
            <Button asChild variant="outline">
              <Link href={`/${lang}/update-password`}>{d.change_password}</Link>
            </Button>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[#1e3a5f]">{d.bookings_title}</h2>
            <p className="text-sm text-muted-foreground rounded-lg border bg-muted/30 p-4">{d.bookings_empty}</p>
          </section>

          <form action={logoutAction}>
            <input type="hidden" name="lang" value={lang} />
            <Button type="submit" variant="ghost" className="text-muted-foreground">{d.logout}</Button>
          </form>
        </div>
      </main>

      <Footer lang={lang} dict={dict} />
    </div>
  )
}
