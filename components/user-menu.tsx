'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { LayoutDashboard, LogOut, UserRound } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { hasAdminRole } from '@/lib/admin-users'
import { namesFromAccount } from '@/lib/auth/identity'
import { logoutAction } from '@/lib/actions/auth'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface UserMenuLabels {
  login: string
  account: string
  panel: string
  logout: string
}

const buttonClass =
  'flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#366DA1]'

/**
 * The person icon at the end of the navbar: a link to sign in, or, once signed in, their initial with a menu.
 *
 * It reads the session in the BROWSER, from the cookie (`getSession`, no request to the auth service unless the
 * token has to be renewed), and not on the server. Reading it on the server would make every public page depend
 * on the visitor's cookies, which are on the way of each request and would stop the pages that are the same for
 * everybody from being prepared once. The price is that a signed-in person sees the sign-in icon for a moment
 * before the initial; until the cookie has been read a blank of the same size holds the place, so nothing
 * moves and nobody who is signed in is invited to sign in.
 *
 * What the menu shows is for display only. The panel's door and the account's are checked on the server
 * (`proxy.ts`); an admin link shown by mistake would lead to the sign-in page.
 */
export function UserMenu({ lang, labels }: { lang: string; labels: UserMenuLabels }) {
  // undefined: the cookie has not been read yet. null: nobody is signed in.
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const logoutForm = useRef<HTMLFormElement>(null)

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

  if (user === undefined) return <span className="size-9" aria-hidden />

  if (user === null) {
    return (
      <Link href={`/${lang}/login`} aria-label={labels.login} title={labels.login} className={buttonClass}>
        <UserRound className="size-5" />
      </Link>
    )
  }

  const { firstName } = namesFromAccount(user)
  const initial = (firstName || user.email || '?').charAt(0).toUpperCase()

  return (
    <>
      {/* Outside the menu on purpose: the menu unmounts when it closes, and a form inside it would go with it. */}
      <form ref={logoutForm} action={logoutAction} className="hidden">
        <input type="hidden" name="lang" value={lang} />
      </form>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={labels.account}
          className="flex size-9 items-center justify-center rounded-full bg-[#1e3a5f] text-sm font-semibold text-white transition-colors hover:bg-[#152c4a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#366DA1] cursor-pointer"
        >
          {initial}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="font-normal">
            <span className="block truncate text-sm font-semibold text-foreground">{firstName || user.email}</span>
            {firstName && <span className="block truncate text-xs text-muted-foreground">{user.email}</span>}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link href={`/${lang}/account`}>
              <UserRound />
              {labels.account}
            </Link>
          </DropdownMenuItem>
          {hasAdminRole(user) && (
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link href="/manage">
                <LayoutDashboard />
                {labels.panel}
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="cursor-pointer" onSelect={() => logoutForm.current?.requestSubmit()}>
            <LogOut />
            {labels.logout}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
