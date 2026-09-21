'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Map, Users, Code2, LogOut, Bike, SlidersHorizontal, Warehouse } from 'lucide-react'
import { logoutAction } from '@/lib/actions/auth'
import { cn } from '@/lib/utils'
import type { AdminUserSummary } from '@/lib/admin-users'
import type { LucideIcon } from 'lucide-react'

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  exact?: boolean
}

interface NavGroup {
  /** Omitted for the top, ungrouped entry (Home) — no header renders for it. */
  label?: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  { items: [{ href: '/manage', label: 'Home', icon: Home, exact: true }] },
  { label: 'Content', items: [
    { href: '/manage/routes', label: 'Routes', icon: Map },
  ] },
  { label: 'Bikes', items: [
    { href: '/manage/bikes', label: 'Bikes', icon: Bike },
    { href: '/manage/bikes/shop', label: 'Shop', icon: Warehouse },
    { href: '/manage/bike-options', label: 'Bike options', icon: SlidersHorizontal },
  ] },
  { label: 'System', items: [
    { href: '/manage/users', label: 'Access', icon: Users },
  ] },
]

// /manage/bikes/shop shares the /manage/bikes prefix with the "Bikes" entry
// above it — without this exception both would light up at once whenever
// the shop page is open.
function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href
  if (item.href === '/manage/bikes') {
    return pathname.startsWith(item.href) && !pathname.startsWith('/manage/bikes/shop')
  }
  return pathname.startsWith(item.href)
}

export function AdminSidebar({ hasDevAccess }: { hasDevAccess?: AdminUserSummary['hasDevAccess'] }) {
  const pathname = usePathname()
  const groups = hasDevAccess
    ? navGroups.map((group) =>
        group.label === 'System'
          ? { ...group, items: [...group.items, { href: '/manage/dev', label: 'Dev', icon: Code2 }] }
          : group
      )
    : navGroups

  return (
    <aside className="w-56 min-h-screen bg-[#1e3a5f] flex flex-col py-6 px-3 shrink-0">
      <div className="text-white font-bold text-sm px-3 mb-8">Manage</div>

      <nav className="flex-1 space-y-5">
        {groups.map((group, i) => (
          <div key={group.label ?? `group-${i}`} className="space-y-1">
            {group.label && (
              <div className="px-3 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                {group.label}
              </div>
            )}
            {group.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                  isActive(pathname, item)
                    ? 'bg-white/15 text-white font-medium'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                )}
              >
                <item.icon size={15} />
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <form action={logoutAction}>
        <button
          type="submit"
          className="flex items-center gap-2 px-3 py-2 text-white/50 hover:text-white text-sm w-full rounded-md hover:bg-white/10 transition-colors"
        >
          <LogOut size={15} />
          Log out
        </button>
      </form>
    </aside>
  )
}
