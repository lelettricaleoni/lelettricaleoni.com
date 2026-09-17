import { eq, and, sql } from 'drizzle-orm'
import { cacheLife, cacheTag } from 'next/cache'
import { db, routes, routeTranslations, media } from '@/lib/db'
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

  // One query, not one-plus-N: this used to fetch routes, then fire a
  // separate translation lookup per route through Promise.all — seven
  // published routes meant seven concurrent queries against a pool of three
  // connections (lib/db/index.ts), every time this cache entry regenerated.
  // That contention is what actually hung /routes in production on
  // 2026-09-15, repeatedly, traced live via pg_stat_activity (stuck
  // backends in ClientRead) — not the single slow query the earlier fix
  // that day (raising max: 1 to 3) was aimed at. The inner join on locale
  // does the same filtering the old "if (!translation) return null" did:
  // a route with no translation for this language drops out.
  return db
    .select({ route: routes, translation: routeTranslations })
    .from(routes)
    .innerJoin(
      routeTranslations,
      and(eq(routeTranslations.routeId, routes.id), eq(routeTranslations.locale, lang))
    )
    .where(and(eq(routes.isPublished, true), eq(routes.unlisted, false)))
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

  const rawMedia = await db.select().from(media)
    .where(eq(media.routeId, route.id))
    .orderBy(media.displayOrder)

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
