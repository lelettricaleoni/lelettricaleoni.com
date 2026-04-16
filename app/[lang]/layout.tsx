import type { Metadata } from 'next'
import { getDictionary, hasLocale } from './dictionaries'
import { notFound } from 'next/navigation'

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

  const dict = await getDictionary(lang)
  const descriptions: Record<string, string> = {
    it: 'Noleggio e-bike Flyer, bici classiche e Segway a Dro (TN), sul Lago di Garda. Riparazioni bici di ogni tipo. Aperto tutti i giorni 09–19.',
    en: 'Flyer e-bike, classic bicycle and Segway rental in Dro, Lake Garda (Italy). Bike repairs of all types. Open every day 09:00–19:00.',
    de: 'Flyer E-Bike, klassisches Fahrrad und Segway Verleih in Dro am Gardasee (Italien). Fahrradreparaturen aller Art. Täglich geöffnet 09–19 Uhr.',
  }

  return {
    metadataBase: new URL('https://lelettricaleoni.com'),
    title: {
      template: `%s | ${dict.hero.headline}`,
      default: `${dict.hero.headline} — ${dict.hero.subheadline}`,
    },
    description: descriptions[lang] ?? descriptions.it,
    keywords: [
      'noleggio ebike', 'e-bike Dro', 'Flyer bike', 'noleggio bici Garda',
      'bike rental Lake Garda', 'riparazioni bici', 'Segway Dro', 'Trentino',
      'Fahrradverleih Gardasee', 'E-Bike Verleih Trentino',
    ],
    authors: [{ name: "L'Elettrica Leoni" }],
    creator: "L'Elettrica Leoni",
    openGraph: {
      type: 'website',
      locale: lang === 'it' ? 'it_IT' : lang === 'de' ? 'de_DE' : 'en_US',
      url: `https://lelettricaleoni.com/${lang}`,
      siteName: "L'Elettrica Leoni",
      title: `${dict.hero.headline} — ${dict.hero.subheadline}`,
      description: descriptions[lang] ?? descriptions.it,
      images: [
        {
          url: '/opengraph-image',
          width: 1200,
          height: 630,
          alt: "L'Elettrica Leoni",
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: dict.hero.headline,
      description: descriptions[lang] ?? descriptions.it,
    },
    alternates: {
      canonical: `https://lelettricaleoni.com/${lang}`,
      languages: {
        'it': 'https://lelettricaleoni.com/it',
        'en': 'https://lelettricaleoni.com/en',
        'de': 'https://lelettricaleoni.com/de',
      },
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
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

  // html/body are in the root app/layout.tsx — this layout only handles metadata.
  return <>{children}</>
}
