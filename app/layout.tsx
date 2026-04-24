import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import { CookieConsentInit } from '@/components/cookie-consent'
import { headers } from 'next/headers'
import './globals.css'

const geist = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#366DA1',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // x-locale is injected by proxy.ts on every request so the html[lang]
  // attribute is always correct without needing URL params here.
  const headersList = await headers()
  const locale = headersList.get('x-locale') ?? 'it'
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

  return (
    <html lang={locale} className={`${geist.variable} antialiased`}>
      <body className="min-h-screen flex flex-col bg-background text-foreground">
        <CookieConsentInit locale={locale} gaId={gaId ?? undefined} />
        {children}
      </body>
    </html>
  )
}
