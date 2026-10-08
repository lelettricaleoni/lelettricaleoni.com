'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LuCheck, LuChevronDown } from 'react-icons/lu'
import ReactCountryFlag from 'react-country-flag'
import { trackEvent } from '@/lib/analytics'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { switchLocalePath } from '@/lib/service-pages'
import type { Locale } from '@/app/[lang]/dictionaries'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// The names are written in their own language, on purpose: somebody who cannot read the page must still find theirs.
const locales: { code: Locale; countryCode: string; label: string; name: string }[] = [
  { code: 'it', countryCode: 'IT', label: 'IT', name: 'Italiano' },
  { code: 'en', countryCode: 'GB', label: 'EN', name: 'English' },
  { code: 'de', countryCode: 'DE', label: 'DE', name: 'Deutsch' },
]

function Flag({ countryCode, label }: { countryCode: string; label: string }) {
  return (
    <ReactCountryFlag
      countryCode={countryCode}
      svg
      // The library fetches its SVGs from cdn.jsdelivr.net unless told otherwise,
      // and this project takes no external CDN. The three flags are in
      // public/svg/flags (flag-icons, MIT; the licence is beside them) —
      // under svg/ because proxy.ts lets that path through without a locale.
      cdnUrl="/svg/flags/"
      style={{ width: '1.2em', height: '1.2em', borderRadius: '2px' }}
      aria-label={label}
    />
  )
}

/**
 * The language of the page: the current one on a small button, the three on a menu. Three side by side took the room
 * the account button needed. The other pages in each language are still declared to search engines through the
 * `hreflang` alternates in the metadata and the sitemap, so the links hiding in a closed menu lose nothing there.
 */
export function LanguageSwitcher({ currentLang }: { currentLang: string }) {
  const pathname = usePathname()
  const current = locales.find((locale) => locale.code === currentLang) ?? locales[0]

  return (
    // modal={false}: a modal menu locks the page's scroll, which removes its scrollbar and widens the page by that much,
    // and the fixed bar then jumps sideways every time a menu opens.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label={current.name}
        title={current.name}
        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'bg-transparent gap-1.5 px-2.5 text-xs font-semibold')}
      >
        <Flag countryCode={current.countryCode} label={current.label} />
        <span className="hidden sm:inline">{current.label}</span>
        <LuChevronDown className="text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        {locales.map((locale) => (
          <DropdownMenuItem key={locale.code} asChild className="cursor-pointer">
            <Link
              href={switchLocalePath(pathname, locale.code)}
              hrefLang={locale.code}
              onClick={() => {
                if (locale.code !== currentLang) trackEvent('language_switch', { language: locale.code })
              }}
            >
              <Flag countryCode={locale.countryCode} label={locale.label} />
              <span className="flex-1">{locale.name}</span>
              {locale.code === currentLang && <LuCheck className="text-primary" aria-hidden />}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
