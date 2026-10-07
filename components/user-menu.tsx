'use client'
import { useRef } from 'react'
import Link from 'next/link'
import { ChevronDown, LayoutDashboard, LogOut, UserRound } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { hasAdminRole } from '@/lib/admin-users'
import { namesFromAccount } from '@/lib/auth/identity'
import { logoutAction } from '@/lib/actions/auth'
import { buttonVariants } from '@/components/ui/button'
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

// The site's own Button, so the bar follows the same rules as every other button (docs/design-rules, skill
// `design-system`): a small button with rounded corners, the language one next to it in the same style. The one
// filled button of the bar is the sign-in, in the Button's default colour (`primary`), because it is the one thing a visitor who is not signed in may want to do.
const signInClass = buttonVariants({ size: 'sm', className: 'font-semibold' })
const accountClass = buttonVariants({ variant: 'outline', size: 'sm', className: 'gap-2 pl-1.5 pr-2.5 font-medium' })

/**
 * The person icon at the end of the navbar: a link to sign in, or, once signed in, their initial with a menu.
 *
 * The user comes from `NavbarEnd`, which reads the session in the browser (undefined until it has been read, null when nobody
 * is signed in). Until it is known a blank of the same size as the sign-in button holds the place, so nothing moves and
 * nobody who is signed in is invited to sign in.
 *
 * What the menu shows is for display only. The panel's door and the account's are checked on the server
 * (`proxy.ts`); an admin link shown by mistake would lead to the sign-in page.
 */
export function UserMenu({ lang, labels, user }: { lang: string; labels: UserMenuLabels; user: User | null | undefined }) {
  const logoutForm = useRef<HTMLFormElement>(null)

  // A blank the size of the sign-in button: the bar does not move when the cookie has been read.
  if (user === undefined) return <span className="h-9 w-[5.5rem]" aria-hidden />

  if (user === null) {
    return (
      <Link href={`/${lang}/login`} className={signInClass}>
        <UserRound aria-hidden />
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
      {/* modal={false}: see language-switcher.tsx; a modal menu makes the fixed bar jump when the scrollbar goes away. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger aria-label={labels.account} className={accountClass}>
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initial}
          </span>
          {firstName && <span className="hidden max-w-24 truncate sm:inline">{firstName}</span>}
          <ChevronDown className="text-muted-foreground" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="font-normal">
            <span className="block truncate text-sm font-semibold text-foreground">{firstName || user.email}</span>
            {firstName && <span className="block truncate text-xs text-muted-foreground">{user.email}</span>}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link href={`/${lang}/account/settings`}>
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
