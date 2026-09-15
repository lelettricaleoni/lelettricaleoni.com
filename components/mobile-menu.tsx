'use client'
import { useState, useEffect, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { usePathname } from 'next/navigation'

interface MobileMenuProps {
  links: { href: string; label: string }[]
}

// No subscription needed: this never changes after the first client render,
// it only ever tells React "server snapshot" vs "client snapshot" once.
const noopSubscribe = () => () => {}

export function MobileMenu({ links }: MobileMenuProps) {
  const [open, setOpen] = useState(false)
  // Portal target (document.body) doesn't exist during SSR. useSyncExternalStore
  // reports false for the server-rendered/hydration pass and true right after,
  // through React's own hydration mechanism — no setState-in-effect render
  // cascade the way a useState+useEffect mount flag causes.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false)
  const pathname = usePathname()

  // Closing the drawer when the route changes is a same-render adjustment to
  // a prop change, not a side effect: comparing against the last pathname
  // seen and calling setState during render (React's own documented pattern)
  // avoids the extra render a useEffect would add after every navigation.
  const [prevPathname, setPrevPathname] = useState(pathname)
  if (pathname !== prevPathname) {
    setPrevPathname(pathname)
    setOpen(false)
  }

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const overlay = open ? (
    <>
      {/* Backdrop — portale a document.body, fuori dall'header con backdrop-filter */}
      <div
        className="fixed inset-0 z-[998] bg-black/40 cursor-pointer"
        onClick={() => setOpen(false)}
        aria-hidden
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu di navigazione"
        className="fixed top-0 right-0 z-[999] h-screen w-72 max-w-[85vw] bg-white shadow-2xl flex flex-col"
      >
        <div className="h-16 flex items-center justify-between px-5 border-b border-border/60">
          <span className="text-sm font-semibold text-[#1e3a5f] tracking-wide uppercase">Menu</span>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-[#1e3a5f] hover:bg-[#1e3a5f]/5 transition-colors cursor-pointer"
            aria-label="Chiudi menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="flex items-center px-6 py-4 text-base font-medium text-[#1e3a5f] hover:bg-[#1e3a5f]/5 border-b border-border/20 last:border-0 transition-colors"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  ) : null

  return (
    <>
      <button
        className="md:hidden p-2 -mr-1 rounded-md text-muted-foreground hover:text-[#1e3a5f] transition-colors cursor-pointer"
        onClick={() => setOpen(true)}
        aria-label="Apri menu"
        aria-expanded={open}
      >
        <Menu size={22} />
      </button>

      {mounted && createPortal(overlay, document.body)}
    </>
  )
}
