import { eq, and, sql } from 'drizzle-orm'
import { cacheLife, cacheTag } from 'next/cache'
import { db, routes, routeTranslations, routePhotos } from '@/lib/db'
import { resolveHlsUrl } from '@/lib/media'
import { loadGpxPoints } from '@/lib/route-gpx'

type Locale = 'it' | 'en' | 'de'

// getFlags() deliberately does NOT live in here: @flags-sdk/vercel reads
// headers() internally (Vercel Toolbar override support), and Cache
// Components forbids any headers()/cookies() access inside a "use cache"
// scope, even indirect. Callers read flags themselves, outside this
// function, and only call this for the DB data — the actually expensive,
// genuinely cacheable part.
export async function getRoutesListData(lang: Locale) {
  'use cache'
  cacheLife('routesFlags')
  cacheTag('routes-list')

  const publishedRoutes = await db
    .select()
    .from(routes)
    .where(eq(routes.isPublished, true))

  const routesWithTranslations = (
    await Promise.all(
      publishedRoutes.map(async (route) => {
        const [translation] = await db
          .select()
          .from(routeTranslations)
          .where(and(
            eq(routeTranslations.routeId, route.id),
            eq(routeTranslations.locale, lang)
          ))
        if (!translation) return null
        return { route, translation }
      })
    )
  ).filter((i): i is NonNullable<typeof i> => i !== null)

  return routesWithTranslations
}

// Same reasoning as getRoutesListData: flags themselves stay out of the cache
// scope. Callers resolve them dynamically and pass in only the three booleans
// that change what this function fetches — different flag combinations get
// their own cache entry, same as different (lang, id) pairs do.
export async function getRouteDetailData(
  lang: Locale,
  id: string,
  mediaFlags: { routeVideos: boolean; routePhotos: boolean; routeFlyover: boolean }
) {
  'use cache'
  cacheLife('routesFlags')
  cacheTag(`route-${id}`)

  const [route] = await db.select().from(routes).where(
    and(sql`left(${routes.id}::text, 8) = ${id}`, eq(routes.isPublished, true))
  )
  if (!route) return null

  const [translation] = await db.select().from(routeTranslations).where(
    and(eq(routeTranslations.routeId, route.id), eq(routeTranslations.locale, lang))
  )

  const rawMedia = await db.select().from(routePhotos)
    .where(eq(routePhotos.routeId, route.id))
    .orderBy(routePhotos.displayOrder)

  // Drop what the flags disallow before the HLS check, so switching videos
  // off also skips the R2 round-trips they would have cost
  const permittedMedia = rawMedia.filter((m) =>
    m.mediaType === 'video' ? mediaFlags.routeVideos : mediaFlags.routePhotos
  )

  // Exclude videos the worker hasn't finished, and carry the resolved manifest
  // URL down so the client doesn't have to guess which one exists.
  // resolveHlsUrl and loadGpxPoints already have their own durable,
  // near-permanent Upstash cache (lib/cache.ts) — this "use cache" wrapper is
  // a thin, short-lived layer on top, not a replacement for it.
  const allMedia = (await Promise.all(
    permittedMedia.map(async (m) => {
      if (m.mediaType !== 'video') return m
      const hlsUrl = await resolveHlsUrl(m.storageKey)
      return hlsUrl ? { ...m, hlsUrl } : null
    })
  )).filter((m): m is NonNullable<typeof m> => m !== null)

  const gpxPoints =
    mediaFlags.routeFlyover && route.gpxKey
      ? await loadGpxPoints(route.gpxKey, route.updatedAt)
      : []

  return { route, translation, allMedia, gpxPoints }
}
