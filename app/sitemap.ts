import type { MetadataRoute } from 'next'

const BASE_URL = 'https://lelettricaleoni.com'
const locales = ['it', 'en', 'de']

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ['', '/privacy']

  return routes.flatMap((route) =>
    locales.map((lang) => ({
      url: `${BASE_URL}/${lang}${route}`,
      lastModified: new Date(),
      changeFrequency: route === '' ? ('weekly' as const) : ('monthly' as const),
      priority: route === '' ? 1 : 0.5,
      alternates: {
        languages: Object.fromEntries(
          locales.map((l) => [l, `${BASE_URL}/${l}${route}`])
        ),
      },
    }))
  )
}
