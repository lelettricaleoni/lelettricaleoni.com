'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

/**
 * The menu of the account area: groups of links, one group for now ("Account settings"); the rentals will be the
 * next one. Rectangles with rounded corners, like every control of the site (skill `design-system`); on a phone
 * the links sit in a row that scrolls.
 */
export function AccountNav({
  groupLabel,
  items,
}: {
  lang: string
  groupLabel: string
  items: { href: string; label: string }[]
}) {
  const pathname = usePathname()
  return (
    <nav aria-label={groupLabel} className="min-w-0">
      <p className="mb-2 hidden px-3 text-xs font-semibold text-muted-foreground md:block">{groupLabel}</p>
      <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
        {items.map((item) => {
          // The first item is the section itself: it is active only on its own page, not on the pages under it.
          const active = pathname === item.href
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
    </nav>
  )
}
