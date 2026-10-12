'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LuUserRound } from 'react-icons/lu'
import type { User } from '@supabase/supabase-js'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { LanguageLinks, LanguageSwitcher } from './language-switcher'
import { MobileMenu } from './mobile-menu'
import { UserMenu, type UserMenuLabels } from './user-menu'

/**
 * The signed-in user as the BROWSER knows it, from the session cookie (`getSession`: no request to the auth service
 * unless the token has to be renewed), and kept up to date when the person signs in or out.
 * `undefined` until the cookie has been read, `null` when nobody is signed in.
 *
 * It is read here and not on the server on purpose: reading it on the server would make every public page depend on
 * the visitor's cookies, which are on the way of each request, and would stop the pages that are the same for
 * everybody from being prepared once.
 */
function useSessionUser(): User | null | undefined {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) setUser(data.session?.user ?? null)
    })
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [])
  return user
}

export type NavbarEndLabels = UserMenuLabels & { book: string }

/**
 * The end of the navbar, from the language to the menu button. A visitor gets the language menu and the sign-in; somebody who is
 * signed in gets the account menu and NO language menu: their language is a setting of the account (account settings), and the site
 * follows it. While the cookie has not been read yet the language menu stays (most visitors are not signed in, and for them nothing
 * flickers); for somebody who is signed in it goes away a moment after the page appears.
 *
 * "Book" is the last thing before the menu button, so that nothing which appears after the cookie is read pushes it: it is the one
 * button of the bar that is filled, because it is what the site is for. On a phone the language and the sign-in do not fit beside it
 * and move into the menu (the drawer shows them only there, `sm:hidden`).
 */
export function NavbarEnd({ lang, labels, menuLinks }: { lang: string; labels: NavbarEndLabels; menuLinks: { href: string; label: string }[] }) {
  const user = useSessionUser()
  return (
    <>
      {!user && <div className="max-sm:hidden"><LanguageSwitcher currentLang={lang} /></div>}
      <UserMenu lang={lang} labels={labels} user={user} />
      <Link href={`/${lang}/rent`} className={buttonVariants({ size: 'sm', className: 'font-semibold' })}>
        {labels.book}
      </Link>
      <MobileMenu
        links={menuLinks}
        footer={user === null ? (
          <div className="space-y-3 border-t border-border/60 p-4 sm:hidden">
            <Link href={`/${lang}/login`} className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}>
              <LuUserRound aria-hidden />
              {labels.login}
            </Link>
            <LanguageLinks currentLang={lang} />
          </div>
        ) : undefined}
      />
    </>
  )
}
