'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import ReactCountryFlag from 'react-country-flag'
import { cn } from '@/lib/utils'
import { trackEvent } from '@/lib/analytics'

const locales = [
  { code: 'it', countryCode: 'IT', label: 'IT' },
  { code: 'en', countryCode: 'GB', label: 'EN' },
  { code: 'de', countryCode: 'DE', label: 'DE' },
]

export function LanguageSwitcher({ currentLang }: { currentLang: string }) {
  const pathname = usePathname()

  function buildHref(targetLang: string): string {
    const segments = pathname.split('/')
    segments[1] = targetLang
    return segments.join('/') || '/'
  }

  return (
    <div className="flex items-center gap-1">
      {locales.map((locale) => (
        <Link
          key={locale.code}
          href={buildHref(locale.code)}
          title={locale.label}
          onClick={() => {
            if (locale.code !== currentLang) {
              trackEvent('language_switch', { language: locale.code })
            }
          }}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-semibold transition-all duration-150',
            currentLang === locale.code
              ? 'bg-slate-100 text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-slate-50'
          )}
        >
          <ReactCountryFlag
            countryCode={locale.countryCode}
            svg
            // The library fetches its SVGs from cdn.jsdelivr.net unless told otherwise,
            // and this project takes no external CDN. The three flags are in
            // public/svg/flags (flag-icons, MIT; the licence is beside them) —
            // under svg/ because proxy.ts lets that path through without a locale.
            cdnUrl="/svg/flags/"
            style={{ width: '1.2em', height: '1.2em', borderRadius: '2px' }}
            aria-label={locale.label}
          />
          <span>{locale.label}</span>
        </Link>
      ))}
    </div>
  )
}
