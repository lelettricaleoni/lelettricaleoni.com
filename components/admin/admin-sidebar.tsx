'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Map, Users, Code2, LogOut } from 'lucide-react'
import { logoutAction } from '@/lib/actions/auth'
import { cn } from '@/lib/utils'
import type { AdminUserSummary } from '@/lib/admin-users'

const navItems = [
  { href: '/manage/routes', label: 'Routes', icon: Map },
  { href: '/manage/users', label: 'Access', icon: Users },
]

export function AdminSidebar({ hasDevAccess }: { hasDevAccess?: AdminUserSummary['hasDevAccess'] }) {
  const pathname = usePathname()
  const items = hasDevAccess
    ? [...navItems, { href: '/manage/dev', label: 'Dev', icon: Code2 }]
    : navItems

  return (
    <aside className="w-56 min-h-screen bg-[#1e3a5f] flex flex-col py-6 px-3 shrink-0">
      <div className="text-white font-bold text-sm px-3 mb-8">Manage</div>
      
      <nav className="flex-1 space-y-1">
        {items.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
              pathname.startsWith(href)
                ? 'bg-white/15 text-white font-medium'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            )}
          >
            <Icon size={15} />
            {label}
          </Link>
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
