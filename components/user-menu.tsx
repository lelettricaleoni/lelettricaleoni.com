'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, LayoutDashboard, LogOut, UserRound } from 'lucide-react'
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

// Same height and roundness as the language button next to it: the two read as one family. The one filled
// button of the bar is the sign-in, because it is the one thing a visitor who is not signed in may want to do.
const focusClass = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#366DA1]'
const signInClass = `flex h-9 items-center gap-1.5 rounded-full bg-[#1e3a5f] px-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#152c4a] ${focusClass}`
const accountClass = `flex h-9 items-center gap-2 rounded-full border border-border/70 py-1 pl-1 pr-2.5 text-sm font-medium text-foreground transition-colors hover:bg-slate-50 cursor-pointer ${focusClass}`

/**
 * The person icon at the end of the navbar: a link to sign in, or, once signed in, their initial with a menu.
 *
 * It reads the session in the BROWSER, from the cookie (`getSession`, no request to the auth service unless the
 * token has to be renewed), and not on the server. Reading it on the server would make every public page depend
 * on the visitor's cookies, which are on the way of each request and would stop the pages that are the same for
 * everybody from being prepared once. The price is that a signed-in person could see the sign-in button for a
 * moment; until the cookie has been read a blank of the same size holds the place, so nothing moves and nobody
 * who is signed in is invited to sign in.
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

  // A blank the size of the sign-in button: the bar does not move when the cookie has been read.
  if (user === undefined) return <span className="h-9 w-[5.5rem]" aria-hidden />

  if (user === null) {
    return (
      <Link href={`/${lang}/login`} className={signInClass}>
        <UserRound className="size-4" aria-hidden />
        {labels.login}
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
        <DropdownMenuTrigger aria-label={labels.account} className={accountClass}>
          <span className="flex size-7 items-center justify-center rounded-full bg-[#1e3a5f] text-xs font-semibold text-white">
            {initial}
          </span>
          {firstName && <span className="hidden max-w-24 truncate sm:inline">{firstName}</span>}
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
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
