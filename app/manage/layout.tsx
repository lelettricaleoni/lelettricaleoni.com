import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import { Suspense } from 'react'
import '../globals.css'

/**
 * Root layout of the admin panel.
 *
 * There is no `app/layout.tsx` any more: the public site's root layout lives at
 * `app/[lang]/layout.tsx`, so that `<html lang>` comes from the URL instead of a
 * request header. That makes every top-level folder its own root layout, and a
 * root layout must render `<html>` and `<body>` itself.
 *
 * The admin panel sits behind a login and is never indexed, so nothing in it is
 * worth prerendering. The Suspense boundary around `children` is what lets the
 * pages below read cookies and query the database without each one declaring a
 * boundary of its own.
 */

const geist = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Manage · Lelettrica',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#366DA1',
}

export default function ManageRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={`${geist.variable} antialiased`}>
      <body className="min-h-screen flex flex-col bg-background text-foreground">
        <Suspense>{children}</Suspense>
      </body>
    </html>
  )
}
