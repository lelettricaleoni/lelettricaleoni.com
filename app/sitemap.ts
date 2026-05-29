import type { MetadataRoute } from 'next'
import { eq } from 'drizzle-orm'
import { db, routes } from '@/lib/db'
import { shortRouteId } from '@/lib/utils'

const BASE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')
const locales = ['it', 'en', 'de']
const LAST_MODIFIED = new Date('2026-04-20')

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: { path: string; priority: number; freq: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
    { path: '',          priority: 1.0, freq: 'weekly'  },
    { path: '/percorsi', priority: 0.9, freq: 'weekly'  },
    { path: '/privacy',  priority: 0.3, freq: 'monthly' },
  ]

  const staticEntries = staticRoutes.flatMap(({ path, priority, freq }) =>
    locales.map((lang) => ({
      url: `${BASE_URL}/${lang}${path}`,
      lastModified: LAST_MODIFIED,
      changeFrequency: freq,
      priority,
      alternates: {
        languages: {
          ...Object.fromEntries(locales.map((l) => [l, `${BASE_URL}/${l}${path}`])),
          'x-default': `${BASE_URL}/it${path}`,
        },
      },
    }))
  )

  let dynamicEntries: MetadataRoute.Sitemap = []
  try {
    const publishedRoutes = await db
      .select({ id: routes.id, updatedAt: routes.updatedAt })
      .from(routes)
      .where(eq(routes.isPublished, true))

    dynamicEntries = publishedRoutes.flatMap((route) => {
      const sid = shortRouteId(route.id)
      return locales.map((lang) => ({
        url: `${BASE_URL}/${lang}/percorsi/${sid}`,
        lastModified: route.updatedAt,
        changeFrequency: 'monthly' as const,
        priority: 0.7,
        alternates: {
          languages: {
            ...Object.fromEntries(locales.map((l) => [l, `${BASE_URL}/${l}/percorsi/${sid}`])),
            'x-default': `${BASE_URL}/it/percorsi/${sid}`,
          },
        },
      }))
    })
  } catch {}

  return [...staticEntries, ...dynamicEntries]
}
