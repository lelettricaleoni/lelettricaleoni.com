import type { MetadataRoute } from 'next'
import { eq, and } from 'drizzle-orm'
import { db, routes } from '@/lib/db'
import { shortRouteId } from '@/lib/utils'
import { getFlags } from '@/lib/flags'
import { readThrough } from '@/lib/cache'

const BASE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')
const locales = ['it', 'en', 'de']
const LAST_MODIFIED = new Date('2026-04-20')

/**
 * Crawlers fetch this rarely enough that it almost never lands on a warm
 * instance — every hit was re-evaluating all 5 flags cold (network round
 * trips to Vercel's flags service) plus a DB query, measured as the single
 * most expensive route in Active CPU despite being hit twice a day. Cached
 * here instead of in-memory because that cache is per-instance and gone by
 * the next cold start, which is the normal case for a rarely-hit route.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return readThrough('sitemap:v1', buildSitemap, 300)
}

async function buildSitemap(): Promise<MetadataRoute.Sitemap> {
  // A section that is switched off must stop being advertised to search engines
  const flags = await getFlags()

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
          .where(and(eq(routes.isPublished, true), eq(routes.unlisted, false)))
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
