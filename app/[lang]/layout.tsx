import type { Metadata } from 'next'
import { hasLocale } from './dictionaries'
import { notFound } from 'next/navigation'

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')
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
    it: 'Noleggio E-Bike Lago di Garda | Riparazioni Bici — Lelettrica Dro (TN)',
    en: 'E-Bike Rental Lake Garda | Bike Repairs — Lelettrica Dro, Trentino',
    de: 'E-Bike Verleih Gardasee | Fahrradreparatur — Lelettrica Dro, Trentino',
  }

  // ~155 chars: lead with strongest keyword, include location cluster, USP
  const descriptions: Record<string, string> = {
    it: 'Noleggio e-bike Flyer e bici classiche a Dro, vicino a Riva del Garda e Arco. Riparazioni e-bike, MTB, bici da corsa. Aperto tutti i giorni 09:00–19:00. Via Roma 90, Dro (TN).',
    en: 'E-bike and bicycle rental near Riva del Garda, Arco and Lake Garda. Flyer e-bike hire, MTB & road bike repairs. Open every day 09:00–19:00. Via Roma 90, Dro, Trentino.',
    de: 'E-Bike und Fahrradverleih nahe Riva del Garda, Arco und dem Gardasee. Flyer E-Bike mieten, MTB & Rennradreparatur. Täglich 09:00–19:00. Via Roma 90, Dro, Trentino.',
  }

  const keywords: Record<string, string[]> = {
    it: [
      // Noleggio — prodotto
      'noleggio ebike', 'noleggio e-bike', 'noleggio bici elettrica', 'noleggio bici',
      'noleggio mountain bike', 'noleggio MTB', 'noleggio bici da corsa',
      'noleggio Flyer', 'Flyer Uproc', 'Flyer Gotour', 'eMTB noleggio',
      // Noleggio — zona
      'noleggio ebike lago di garda', 'noleggio bici lago di garda',
      'noleggio ebike Dro', 'noleggio bici Dro',
      'noleggio ebike Riva del Garda', 'noleggio bici Riva del Garda',
      'noleggio ebike Arco', 'noleggio ebike Arco Trentino',
      'noleggio ebike Nago-Torbole', 'noleggio ebike Torbole',
      'noleggio ebike Alto Garda', 'noleggio ebike Garda Trentino',
      'noleggio ebike Trentino', 'noleggio bici elettrica Trentino',
      'noleggio ebike Lago di Ledro', 'noleggio bici Lago di Ledro', 'noleggio ebike Ledro',
      'ebike Lago di Garda', 'bici elettrica Garda',
      // Riparazioni
      'riparazione bici lago di garda', 'officina bici Dro',
      'riparazione ebike Trentino', 'riparazione MTB lago di garda',
      'assistenza bici elettrica', 'manutenzione bici Trentino',
      // Esperienze / itinerari
      'giro del Garda in bici', 'pista ciclabile Garda',
      'escursioni ebike lago di garda', 'cicloturismo Garda',
      'bike trail Alto Garda', 'Valle del Sarca in bici',
      // Brand / Geo
      'Lelettrica', 'Lelettrica Dro', 'Dro TN', 'Alto Garda Trentino',
    ],
    en: [
      // Rental — product
      'e-bike rental', 'electric bike hire', 'bike rental', 'mountain bike rental',
      'MTB rental', 'Flyer e-bike rental', 'Flyer Uproc hire', 'Flyer Gotour hire',
      // Rental — location
      'e-bike rental Lake Garda', 'bike rental Lake Garda',
      'e-bike hire Lake Garda', 'electric bike Lake Garda',
      'e-bike rental Riva del Garda', 'bike rental Riva del Garda',
      'e-bike rental Arco', 'bike rental Arco Trentino',
      'e-bike rental Torbole', 'bike rental Nago-Torbole',
      'e-bike rental Lake Ledro', 'bike rental Ledro', 'electric bike Ledro',
      'e-bike rental Trentino', 'electric bike Trentino',
      'cycling Lake Garda', 'Lake Garda cycling holiday',
      // Repairs
      'bike repair Lake Garda', 'e-bike repair Lake Garda',
      'bicycle workshop Trentino', 'MTB repair Garda',
      // Experiences
      'cycling routes Lake Garda', 'bike tour Lake Garda',
      'Lake Garda by bike', 'e-bike tour Trentino',
      // Brand / Geo
      'Lelettrica', 'Dro Trentino', 'Alto Garda', 'Garda Trentino',
    ],
    de: [
      // Verleih — Produkt
      'E-Bike Verleih', 'E-Bike mieten', 'Fahrrad mieten', 'Fahrradverleih',
      'MTB mieten', 'Mountainbike mieten', 'Flyer E-Bike mieten',
      'Flyer Uproc mieten', 'Flyer Gotour mieten', 'eMTB Verleih',
      // Verleih — Standort
      'E-Bike Verleih Gardasee', 'Fahrradverleih Gardasee',
      'E-Bike mieten Gardasee', 'Fahrrad mieten Gardasee',
      'E-Bike Verleih Riva del Garda', 'Fahrradverleih Riva del Garda',
      'E-Bike mieten Riva del Garda', 'Fahrrad Riva del Garda',
      'E-Bike Verleih Arco', 'Fahrradverleih Arco',
      'E-Bike Torbole', 'Fahrradverleih Nago-Torbole',
      'E-Bike Verleih Ledro', 'Fahrradverleih Ledrosee', 'E-Bike mieten Ledro',
      'E-Bike Verleih Trentino', 'Fahrrad Trentino mieten',
      'Radverleih Alto Garda', 'E-Bike Alto Garda',
      // Reparatur
      'Fahrradreparatur Gardasee', 'E-Bike Reparatur Gardasee',
      'Fahrradwerkstatt Trentino', 'MTB Reparatur Garda',
      // Erlebnisse
      'Radtour Gardasee', 'E-Bike Tour Gardasee',
      'Gardasee mit dem Rad', 'Radweg Gardasee',
      'Radfahren Trentino', 'Valle del Sarca Radtour',
      // Brand / Geo
      'Lelettrica', 'Dro Gardasee', 'Alto Garda Trentino',
    ],
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
      ...(keywords[lang] ?? keywords.it),
      // Cross-language evergreen terms
      'Lelettrica', 'Flyer bike', 'Dro TN', 'Via Roma 90 Dro',
    ],
    authors: [{ name: 'Lelettrica di Leoni Gabriele' }],
    creator: 'Lelettrica',
    publisher: 'Lelettrica',
    category: 'sports',
    openGraph: {
      type: 'website',
      locale: lang === 'it' ? 'it_IT' : lang === 'de' ? 'de_DE' : 'en_US',
      alternateLocale: lang === 'it' ? ['en_US', 'de_DE'] : lang === 'de' ? ['it_IT', 'en_US'] : ['it_IT', 'de_DE'],
      url: `${siteUrl}/${lang}`,
      siteName: 'Lelettrica',
      title,
      description,
      images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Lelettrica — Noleggio E-Bike Lago di Garda' }],
      countryName: 'Italy',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    alternates: {
      canonical: `${siteUrl}/${lang}`,
      languages: {
        'it': `${siteUrl}/it`,
        'en': `${siteUrl}/en`,
        'de': `${siteUrl}/de`,
        'x-default': `${siteUrl}/it`,
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
        'max-video-preview': -1,
      },
    },
    verification: {
      // Aggiungi qui Google Search Console / Bing Webmaster se necessario
      // google: 'xxxxxxxxxxxxxxxx',
    },
  }
}

// JSON-LD LocalBusiness schema — usato da Google per rich results (nome, indirizzo, orari, ecc.)
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': ['LocalBusiness', 'BikeShop'],
  '@id': `${siteUrl}/#business`,
  name: 'Lelettrica di Leoni Gabriele',
  alternateName: ['Lelettrica', "L'Elettrica Leoni"],
  description: 'Noleggio e-bike Flyer, bici classiche e riparazioni bici a Dro, sul Lago di Garda (Trentino). Aperto tutti i giorni.',
  url: siteUrl,
  telephone: '+393381232434',
  email: 'lelettricaleoni@gmail.com',
  image: `${siteUrl}/opengraph-image`,
  logo: `${siteUrl}/icon.svg`,
  priceRange: '€€',
  currenciesAccepted: 'EUR',
  paymentAccepted: 'Cash, Credit Card',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Via Roma, 90',
    addressLocality: 'Dro',
    addressRegion: 'TN',
    postalCode: '38074',
    addressCountry: 'IT',
  },
  geo: {
    '@type': 'GeoCoordinates',
    latitude: 45.958900,
    longitude: 10.904293,
  },
  hasMap: 'https://www.google.com/maps/place/Lelettrica+di+Leoni+Gabriele/@45.958900,10.904293,17z',
  openingHoursSpecification: [
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      opens: '09:00',
      closes: '13:00',
    },
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      opens: '14:00',
      closes: '19:00',
    },
  ],
  sameAs: [
    'https://www.instagram.com/lelettricaleoni',
    'https://www.facebook.com/lelettricaleoni',
  ],
  areaServed: [
    { '@type': 'City', name: 'Dro' },
    { '@type': 'City', name: 'Arco' },
    { '@type': 'City', name: 'Riva del Garda' },
    { '@type': 'City', name: 'Nago-Torbole' },
    { '@type': 'City', name: 'Ledro' },
    { '@type': 'LakeBodyOfWater', name: 'Lago di Ledro' },
    { '@type': 'AdministrativeArea', name: 'Alto Garda Trentino' },
    { '@type': 'AdministrativeArea', name: 'Garda Trentino' },
    { '@type': 'LakeBodyOfWater', name: 'Lago di Garda' },
  ],
  knowsAbout: ['E-Bike', 'Bici elettrica', 'Flyer bikes', 'MTB', 'Riparazione bici', 'Noleggio bici', 'Cicloturismo'],
  hasOfferCatalog: {
    '@type': 'OfferCatalog',
    name: 'Noleggio E-Bike e Riparazioni',
    itemListElement: [
      {
        '@type': 'Offer',
        itemOffered: {
          '@type': 'RentalCar',
          name: 'Flyer Uproc 2 — eMTB Front',
          description: 'E-mountain bike frontale Flyer Uproc 2',
        },
        price: '25',
        priceCurrency: 'EUR',
        priceSpecification: { '@type': 'UnitPriceSpecification', referenceQuantity: { '@type': 'QuantitativeValue', value: 0.5, unitCode: 'DAY' } },
      },
      {
        '@type': 'Offer',
        itemOffered: {
          '@type': 'RentalCar',
          name: 'Flyer Gotour 6 — City eBike',
          description: 'E-bike da città/trekking Flyer Gotour 6',
        },
        price: '20',
        priceCurrency: 'EUR',
        priceSpecification: { '@type': 'UnitPriceSpecification', referenceQuantity: { '@type': 'QuantitativeValue', value: 0.5, unitCode: 'DAY' } },
      },
      {
        '@type': 'Offer',
        itemOffered: {
          '@type': 'RentalCar',
          name: 'Flyer Uproc X — eMTB Full',
          description: 'E-mountain bike full suspension Flyer Uproc X',
        },
        price: '70',
        priceCurrency: 'EUR',
        priceSpecification: { '@type': 'UnitPriceSpecification', referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'DAY' } },
      },
    ],
  },
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

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </>
  )
}
