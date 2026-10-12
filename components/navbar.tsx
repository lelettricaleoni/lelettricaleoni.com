import Image from 'next/image'
import Link from 'next/link'
import { NavbarEnd } from './navbar-end'

interface NavbarProps {
  lang: string
  dict: {
    nav: { services: string; pricing: string; contact: string; book: string; login: string; account: string; rents: string; panel: string; logout: string }
    routes?: { nav_label: string }
    bikes?: { nav_label: string }
  }
}

/**
 * The bar shows what a visitor looks for first (the bikes, the routes, the prices, where we are) and the one thing to do ("Book", the
 * filled button at the end); the menu of a phone lists everything, "Services" and "Home" too, and carries the language and the sign-in
 * that do not fit next to the logo there. Whether the routes and bikes sections exist is told by the dictionary: this component is
 * rendered from client pages too, so it must not depend on server-only state.
 */
export function Navbar({ lang, dict }: NavbarProps) {
  const bikes = dict.bikes ? { href: `/${lang}/bikes`, label: dict.bikes.nav_label } : null
  const routes = dict.routes ? { href: `/${lang}/routes`, label: dict.routes.nav_label } : null
  const pricing = { href: `/${lang}#prezzi`, label: dict.nav.pricing }
  const contact = { href: `/${lang}#contatti`, label: dict.nav.contact }

  const barLinks = [bikes, routes, pricing, contact].filter((link) => link !== null)
  const menuLinks = [
    { href: `/${lang}`, label: 'Home' },
    ...[bikes, routes].filter((link) => link !== null),
    { href: `/${lang}#servizi`, label: dict.nav.services },
    pricing,
    contact,
  ]

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-border/50 shadow-sm">
      <nav className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link href={`/${lang}`} className="flex items-center shrink-0">
          <Image
            src="/svg/LogoLelettrica_full.svg"
            alt="Lelettrica"
            width={160}
            height={50}
            priority
            className="h-9 w-auto"
          />
        </Link>

        <div className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
          {barLinks.map(({ href, label }) => (
            <Link key={href} href={href} className="hover:text-primary transition-colors">
              {label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <NavbarEnd lang={lang} labels={dict.nav} menuLinks={menuLinks} />
        </div>
      </nav>
    </header>
  )
}
