import type { MetadataRoute } from 'next'
import { cacheLife, cacheTag } from 'next/cache'
import { eq, and } from 'drizzle-orm'
import { db, routes } from '@/lib/db'
import { shortRouteId } from '@/lib/utils'

const BASE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')
const locales = ['it', 'en', 'de']
const LAST_MODIFIED = new Date('2026-04-20')

// No feature flag decides what shows up here — a switched-off route already
// tells crawlers not to index it directly (the noindex meta tag from the
// "pages that stream can't change status code" trap in STATE.md), so listing
// it in the sitemap too changes nothing for SEO. Measured in Observability:
// with getFlags() in here, this was the single most expensive route in
// Active CPU despite being hit twice a day, because a route hit that rarely
// almost never reuses a warm instance — every crawl re-evaluated all 5 flags
// cold (network round trips to Vercel's flags service) for a value nothing
// here used to read past `routes`.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  'use cache'
  cacheLife('sitemap')
  cacheTag('sitemap')

  const staticRoutes: { path: string; priority: number; freq: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
    { path: '',          priority: 1.0, freq: 'weekly'  },
    { path: '/routes',   priority: 0.9, freq: 'weekly'  },
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
      .where(and(eq(routes.isPublished, true), eq(routes.unlisted, false)))

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
