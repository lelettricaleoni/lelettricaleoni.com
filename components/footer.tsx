import Image from 'next/image'
import Link from 'next/link'
// Instagram SVG inline (lucide-react non include icone di brand)
function InstagramIcon({ size = 22 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  )
}
import { Separator } from '@/components/ui/separator'

interface FooterProps {
  lang: string
  dict: {
    footer: {
      copyright: string
      privacy: string
      cookie_settings: string
      vat: string
    }
  }
}

export function Footer({ lang, dict }: FooterProps) {
  const year = new Date().getFullYear()
  const copyright = dict.footer.copyright.replace('{year}', String(year))

  return (
    <footer className="bg-brand-dark text-white/80 py-12 mt-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8 mb-8">
          {/* Logo */}
          <Link href={`/${lang}`}>
            <Image
              src="/svg/LogoLelettrica_full.svg"
              alt="Lelettrica"
              width={140}
              height={44}
              className="h-8 w-auto brightness-0 invert opacity-90"
            />
          </Link>

          {/* Address + contact */}
          <div className="text-center text-sm text-white/60 space-y-1">
            <p>Via Roma, 90 — Dro, TN 38074, Italia</p>
            <p>
              <a href="tel:+393381232434" className="hover:text-white transition-colors">
                +39 338 123 2434
              </a>
              {' · '}
              <a href="mailto:info@lelettricaleoni.com" className="hover:text-white transition-colors">
                info@lelettricaleoni.com
              </a>
            </p>
          </div>

          {/* Social */}
          <a
            href="https://www.instagram.com/lelettricaleoni"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-white/70 hover:text-white transition-colors"
            aria-label="Instagram"
          >
            <InstagramIcon size={22} />
            <span className="text-sm">@lelettricaleoni</span>
          </a>
        </div>

        <Separator className="bg-white/10 mb-8" />

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/40">
          <p>{copyright}</p>
          <p className="text-white/30">
            {dict.footer.vat} 02622600225 • LELETTRICA DI LEONI GABRIELE
          </p>
          <div className="flex items-center gap-4">
            <Link
              href={`/${lang}/privacy`}
              className="hover:text-white/70 transition-colors"
            >
              {dict.footer.privacy}
            </Link>
            <button
              type="button"
              data-cc="show-preferencesModal"
              className="hover:text-white/70 transition-colors cursor-pointer"
            >
              {dict.footer.cookie_settings}
            </button>
          </div>
        </div>
      </div>
    </footer>
  )
}
