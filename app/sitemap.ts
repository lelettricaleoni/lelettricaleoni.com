import type { MetadataRoute } from 'next'
import { eq } from 'drizzle-orm'
import { db, routes } from '@/lib/db'
import { shortRouteId } from '@/lib/utils'
import { getFlags } from '@/lib/flags'

const BASE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')
const locales = ['it', 'en', 'de']
const LAST_MODIFIED = new Date('2026-04-20')

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // A section that is switched off must stop being advertised to search engines
  const flags = getFlags()

  const staticRoutes: { path: string; priority: number; freq: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
    { path: '',          priority: 1.0, freq: 'weekly'  },
    ...(flags.routes ? [{ path: '/routes', priority: 0.9, freq: 'weekly' as const }] : []),
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
    const publishedRoutes = flags.routes
      ? await db
          .select({ id: routes.id, updatedAt: routes.updatedAt })
          .from(routes)
          .where(eq(routes.isPublished, true))
      : []

    dynamicEntries = publishedRoutes.flatMap((route) => {
      const sid = shortRouteId(route.id)
      return locales.map((lang) => ({
        url: `${BASE_URL}/${lang}/routes/${sid}`,
        lastModified: route.updatedAt,
        changeFrequency: 'monthly' as const,
        priority: 0.7,
        alternates: {
          languages: {
            ...Object.fromEntries(locales.map((l) => [l, `${BASE_URL}/${l}/routes/${sid}`])),
            'x-default': `${BASE_URL}/it/routes/${sid}`,
          },
        },
      }))
    })
  } catch {}

  return [...staticEntries, ...dynamicEntries]
}
