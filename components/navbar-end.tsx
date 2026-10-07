'use client'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { LanguageSwitcher } from './language-switcher'
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

/**
 * The end of the navbar. A visitor gets the language menu and a sign-in button; somebody who is signed in gets the
 * account menu and NO language menu: their language is a setting of the account (account settings), and the site
 * follows it. While the cookie has not been read yet the language menu stays (most visitors are not signed in, and for
 * them nothing flickers); for somebody who is signed in it goes away a moment after the page appears.
 */
export function NavbarEnd({ lang, labels }: { lang: string; labels: UserMenuLabels }) {
  const user = useSessionUser()
  return (
    <>
      {!user && <LanguageSwitcher currentLang={lang} />}
      <UserMenu lang={lang} labels={labels} user={user} />
    </>
  )
}
