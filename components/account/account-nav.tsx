'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export interface AccountNavGroup {
  label: string
  items: { href: string; label: string; /** Active on the pages under it too (a list and its detail pages). */ prefix?: boolean }[]
}

/**
 * The menu of the account area: groups of links, "Account settings" and "Account rents". Rectangles with rounded corners,
 * like every control of the site (skill `design-system`); on a phone the links sit in a row that scrolls.
 */
export function AccountNav({ groups }: { lang: string; groups: AccountNavGroup[] }) {
  const pathname = usePathname()
  return (
    <nav aria-label={groups.map((group) => group.label).join(', ')} className="min-w-0 space-y-4">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-2 hidden px-3 text-xs font-semibold text-muted-foreground md:block">{group.label}</p>
          <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
            {group.items.map((item) => {
              // The first item of the settings is the section itself: active only on its own page, not on the pages under it.
              const active = item.prefix ? pathname === item.href || pathname.startsWith(`${item.href}/`) : pathname === item.href
              return (
                <li key={item.href} className="shrink-0">
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'block whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors',
                      active ? 'bg-muted font-semibold text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
