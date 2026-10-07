import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getDictionary, hasLocale } from '../dictionaries'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { AccountNav } from '@/components/account/account-nav'
import { getCurrentUser } from '@/lib/auth/current-user'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

/**
 * The shell of everything a signed-in person manages: the navigation bar, the menu of the area (Account settings today;
 * the rentals will be its second group) and the page. Signed in or not is decided here as well as in the proxy: the
 * proxy also renews the session, which a page cannot do (it cannot set cookies), and this is the check that does not
 * depend on it.
 */
export default async function AccountLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  if (!hasLocale(lang)) notFound()

  const user = await getCurrentUser()
  if (!user) redirect(`/${lang}/login?next=${encodeURIComponent(`/${lang}/account/settings`)}`)

  const dict = await getDictionary(lang)
  const d = dict.account

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar lang={lang} dict={dict} />
      <main className="flex-1 pt-24 pb-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 grid gap-8 md:grid-cols-[13rem_minmax(0,1fr)]">
          <AccountNav
            lang={lang}
            groupLabel={d.settings_title}
            items={[
              { href: `/${lang}/account/settings`, label: d.nav_profile },
              { href: `/${lang}/account/settings/security`, label: d.nav_security },
              { href: `/${lang}/account/settings/privacy`, label: d.nav_privacy },
            ]}
          />
          <div className="max-w-2xl space-y-10">{children}</div>
        </div>
      </main>
      <Footer lang={lang} dict={dict} />
    </div>
  )
}
