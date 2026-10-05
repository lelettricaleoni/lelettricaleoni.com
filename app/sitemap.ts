import type { MetadataRoute } from 'next'
import { cacheLife, cacheTag } from 'next/cache'
import { eq, and } from 'drizzle-orm'
import { db, routes, bikeModels, bikeUnits } from '@/lib/db'
import { shortId } from '@/lib/utils'
import { inGarage } from '@/lib/in-garage'
import { SERVICE_KEYS, servicePageSlug } from '@/lib/service-pages'
import type { Locale } from './[lang]/dictionaries'

const BASE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')
const locales: Locale[] = ['it', 'en', 'de']
const LAST_MODIFIED = new Date('2026-04-20')

// What is listed here does not depend on anything dynamic: a route that is not published tells crawlers not to index
// it on its own page, so there is nothing to decide per request and the sitemap is cached.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  'use cache'
  cacheLife('sitemap')
  cacheTag('sitemap')

  const staticRoutes: { path: string; priority: number; freq: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
    { path: '',          priority: 1.0, freq: 'weekly'  },
    { path: '/routes',   priority: 0.9, freq: 'weekly'  },
    { path: '/bikes',    priority: 0.9, freq: 'weekly'  },
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

  // Same idea as staticEntries, but the slug is the search term itself and
  // therefore differs per language — unlike every other static route here.
  const serviceEntries: MetadataRoute.Sitemap = SERVICE_KEYS.flatMap((key) =>
    locales.map((lang) => ({
      url: `${BASE_URL}/${lang}/${servicePageSlug(key, lang)}`,
      lastModified: LAST_MODIFIED,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
      alternates: {
        languages: {
          ...Object.fromEntries(locales.map((l) => [l, `${BASE_URL}/${l}/${servicePageSlug(key, l)}`])),
          'x-default': `${BASE_URL}/it/${servicePageSlug(key, 'it')}`,
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
      const sid = shortId(route.id)
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

  try {
    // selectDistinct per lo stesso motivo della lista pubblica bici: un
    // modello con più unità in bike_units non deve ripetersi.
    const publishedModelsWithUnits = await db
      .selectDistinct({ id: bikeModels.id, updatedAt: bikeModels.updatedAt })
      .from(bikeModels)
      .innerJoin(bikeUnits, and(eq(bikeUnits.bikeModelId, bikeModels.id), inGarage()))
      .where(eq(bikeModels.isPublished, true))

    dynamicEntries.push(...publishedModelsWithUnits.flatMap((model) => {
      const sid = shortId(model.id)
      return locales.map((lang) => ({
        url: `${BASE_URL}/${lang}/bikes/${sid}`,
        lastModified: model.updatedAt,
        changeFrequency: 'monthly' as const,
        priority: 0.7,
        alternates: {
          languages: {
            ...Object.fromEntries(locales.map((l) => [l, `${BASE_URL}/${l}/bikes/${sid}`])),
            'x-default': `${BASE_URL}/it/bikes/${sid}`,
          },
        },
      }))
    }))
  } catch {}

  return [...staticEntries, ...serviceEntries, ...dynamicEntries]
}
