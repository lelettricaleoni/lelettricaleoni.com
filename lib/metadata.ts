const OG_LOCALES: Record<string, { locale: string; alternate: string[] }> = {
  it: { locale: 'it_IT', alternate: ['en_US', 'de_DE'] },
  en: { locale: 'en_US', alternate: ['it_IT', 'de_DE'] },
  de: { locale: 'de_DE', alternate: ['it_IT', 'en_US'] },
}

const DEFAULT_IMAGE = {
  url: '/opengraph-image',
  width: 1200,
  height: 630,
  alt: 'Lelettrica — Noleggio E-Bike Lago di Garda',
}

interface SocialMetadataInput {
  lang: string
  title: string
  description: string
  url: string
  image?: { url: string; width?: number; height?: number; alt?: string }
}

/**
 * openGraph and twitter for one page.
 *
 * Next.js does not deep-merge these objects with the root layout's: a page
 * that sets its own `openGraph` but only some fields (title, description...)
 * loses every field it left out — locale, siteName, type, image dimensions —
 * rather than inheriting them. A page with no `openGraph` at all instead
 * inherits the layout's whole object verbatim, including its url, which is
 * always the home page's. Both are wrong for a page that isn't the home page.
 * Every page with its own title/description/url must build the whole thing
 * through here, never a partial object by hand.
 */
export function buildSocialMetadata({ lang, title, description, url, image }: SocialMetadataInput) {
  const { locale, alternate } = OG_LOCALES[lang] ?? OG_LOCALES.it
  return {
    openGraph: {
      type: 'website' as const,
      locale,
      alternateLocale: alternate,
      url,
      siteName: 'Lelettrica',
      title,
      description,
      images: [image ?? DEFAULT_IMAGE],
      countryName: 'Italy',
    },
    twitter: {
      card: 'summary_large_image' as const,
      title,
      description,
    },
  }
}
