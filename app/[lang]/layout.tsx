import type { Metadata } from 'next'
import { hasLocale } from './dictionaries'
import { notFound } from 'next/navigation'

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lelettricaleoni.com').replace(/\/$/, '')
const locales = ['it', 'en', 'de']

export async function generateStaticParams() {
  return [{ lang: 'it' }, { lang: 'en' }, { lang: 'de' }]
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  if (!hasLocale(lang)) return {}

  const titles: Record<string, string> = {
    it: 'Lelettrica - Noleggio E-Bike Flyer & Riparazioni Bici · Dro, Lago di Garda',
    en: 'Lelettrica - Flyer E-Bike Rental & Bike Repairs · Dro, Lake Garda',
    de: 'Lelettrica - Flyer E-Bike Verleih & Fahrradreparaturen · Dro, Gardasee',
  }

  const descriptions: Record<string, string> = {
    it: 'Noleggio E-bike Flyer e bici classiche sul Lago di Garda. Riparazioni bici elettriche, MTB, da corsa e monopattini. Aperto ogni giorno 09:00–19:00 · Via Roma 90, Dro (TN).',
    en: 'Flyer E-bike and classic bicycle rental on Lake Garda. Repairs for e-bikes, MTB, road bikes and electric scooters. Open every day 09:00–19:00 · Dro, Trentino.',
    de: 'Flyer E-Bike und Fahrradverleih am Gardasee. Reparaturen für E-Bikes, MTB, Rennräder und E-Scooter. Täglich geöffnet 09:00–19:00 · Dro, Trentino.',
  }

  const title = titles[lang] ?? titles.it
  const description = descriptions[lang] ?? descriptions.it

  return {
    metadataBase: new URL(siteUrl),
    title: {
      template: `%s | Lelettrica`,
      default: title,
    },
    description,
    keywords: [
      'noleggio ebike', 'e-bike Dro', 'Flyer bike', 'noleggio bici Lago di Garda',
      'bike rental Lake Garda', 'riparazioni bici Trentino',
      'Flyer Uproc', 'Flyer Gotour', 'bici elettrica Garda', 'Dro TN',
      'Fahrradverleih Gardasee', 'E-Bike Verleih Trentino',
    ],
    authors: [{ name: 'Lelettrica' }],
    creator: 'Lelettrica',
    openGraph: {
      type: 'website',
      locale: lang === 'it' ? 'it_IT' : lang === 'de' ? 'de_DE' : 'en_US',
      url: `${siteUrl}/${lang}`,
      siteName: 'Lelettrica',
      title,
      description,
      images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Lelettrica' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    alternates: {
      canonical: `${siteUrl}/${lang}`,
      languages: Object.fromEntries(locales.map((l) => [l, `${siteUrl}/${l}`])),
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
    },
  }
}

export default async function LangLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  if (!hasLocale(lang)) notFound()

  return <>{children}</>
}
