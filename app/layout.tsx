import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import Script from 'next/script'
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
  const headersList = await headers()
  const locale = headersList.get('x-locale') ?? 'it'
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

  return (
    <html lang={locale} className={`${geist.variable} antialiased`}>
      <body className="min-h-screen flex flex-col bg-background text-foreground">
        {gaId && (
          <>
            {/* Consent Mode v2 — defaults denied, wait 500ms for banner response */}
            <Script
              id="ga4-consent-init"
              strategy="beforeInteractive"
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer=window.dataLayer||[];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('consent','default',{
                    analytics_storage:'denied',
                    ad_storage:'denied',
                    ad_user_data:'denied',
                    ad_personalization:'denied',
                    wait_for_update:500
                  });
                  gtag('js',new Date());
                  gtag('config','${gaId}');
                `,
              }}
            />
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="afterInteractive"
            />
          </>
        )}
        <CookieConsentInit locale={locale} />
        {children}
      </body>
    </html>
  )
}
