'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const locales = [
  { code: 'it', label: 'IT' },
  { code: 'en', label: 'EN' },
  { code: 'de', label: 'DE' },
]

export function LanguageSwitcher({ currentLang }: { currentLang: string }) {
  const pathname = usePathname()

  function buildHref(targetLang: string): string {
    // Replace the first segment (current locale) with the target locale
    const segments = pathname.split('/')
    segments[1] = targetLang
    return segments.join('/') || '/'
  }

  return (
    <div className="flex items-center gap-1 text-sm font-medium">
      {locales.map((locale, idx) => (
        <span key={locale.code} className="flex items-center gap-1">
          <Link
            href={buildHref(locale.code)}
            className={cn(
              'transition-colors hover:text-primary',
              currentLang === locale.code
                ? 'text-primary font-semibold'
                : 'text-muted-foreground'
            )}
          >
            {locale.label}
          </Link>
          {idx < locales.length - 1 && (
            <span className="text-muted-foreground/40 select-none">|</span>
          )}
        </span>
      ))}
    </div>
  )
}
