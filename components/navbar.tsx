import Image from 'next/image'
import Link from 'next/link'
import { LanguageSwitcher } from './language-switcher'

interface NavbarProps {
  lang: string
  dict: {
    nav: { services: string; pricing: string; contact: string }
  }
}

export function Navbar({ lang, dict }: NavbarProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-border/50 shadow-sm">
      <nav className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link href={`/${lang}`} className="flex items-center shrink-0">
          <Image
            src="/svg/LogoLelettrica_full.svg"
            alt="L'Elettrica Leoni"
            width={160}
            height={50}
            priority
            className="h-9 w-auto"
          />
        </Link>

        <div className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
          <Link href={`/${lang}#servizi`} className="hover:text-primary transition-colors">
            {dict.nav.services}
          </Link>
          <Link href={`/${lang}#prezzi`} className="hover:text-primary transition-colors">
            {dict.nav.pricing}
          </Link>
          <Link href={`/${lang}#contatti`} className="hover:text-primary transition-colors">
            {dict.nav.contact}
          </Link>
        </div>

        <LanguageSwitcher currentLang={lang} />
      </nav>
    </header>
  )
}
