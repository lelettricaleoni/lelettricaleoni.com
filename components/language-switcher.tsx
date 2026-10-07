'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Check, ChevronDown } from 'lucide-react'
import ReactCountryFlag from 'react-country-flag'
import { trackEvent } from '@/lib/analytics'
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
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={current.name}
        title={current.name}
        className="flex h-9 items-center gap-1.5 rounded-full border border-border/70 px-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#366DA1] cursor-pointer"
      >
        <Flag countryCode={current.countryCode} label={current.label} />
        <span className="hidden sm:inline">{current.label}</span>
        <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
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
              {locale.code === currentLang && <Check className="text-[#366DA1]" aria-hidden />}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
