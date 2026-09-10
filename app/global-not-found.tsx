import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import { NotFoundPage } from '@/components/not-found-page'
import './globals.css'

/**
 * The 404 for URLs that match no route at all.
 *
 * With the root layout moved under `app/[lang]/`, there is no single layout
 * left to compose a top-level `not-found.tsx` from — which is the case this
 * file exists for. It bypasses normal rendering, so it has to bring its own
 * `<html>`, `<body>`, styles and font.
 *
 * It is in Italian because at this point there is no locale to read: the URL
 * matched nothing, so it carries no language.
 */

const geist = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: '404 - Pagina non trovata | Lelettrica',
  robots: { index: false, follow: false },
}

export default function GlobalNotFound() {
  return (
    <html lang="it" className={`${geist.variable} antialiased`}>
      <body className="min-h-screen flex flex-col bg-background text-foreground">
        <NotFoundPage />
      </body>
    </html>
  )
}
