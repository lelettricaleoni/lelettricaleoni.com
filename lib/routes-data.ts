import { eq, and, asc, sql } from 'drizzle-orm'
import { cacheLife, cacheTag } from 'next/cache'
import { db, routes, routeTranslations, routeBikeCategories, media } from '@/lib/db'
import { resolveReadyMedia } from '@/lib/media'
import { loadGpxPoints } from '@/lib/route-gpx'

type Locale = 'it' | 'en' | 'de'

// What the public list shows. One definition, because "which routes may a
// visitor see" must not drift between the list and the routes suggested on a
// bike page — an unlisted route leaking into a suggestion would defeat it.
const publiclyListed = and(eq(routes.isPublished, true), eq(routes.unlisted, false))

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
    .where(publiclyListed)
    .orderBy(asc(routes.displayOrder))
}

// The reverse of getSuggestedBikesForRoute (lib/bikes-data.ts): a bike's route
// category name → the public routes that list that name in `bike_types`.
// Same order as the public list (displayOrder), first three, id as tiebreaker
// so a tie in displayOrder can't reshuffle the picks between regenerations.
// One query, no per-route lookups (see the N+1 note on getRoutesListData).
// No flags here: the caller gates on `flags.routes`, and the cards' media
// (which the list doesn't gate on photo/video flags either) is resolved per
// card, outside this cache, by RouteCardMediaAsync.
export async function getSuggestedRoutesForBike(lang: Locale, routeCategoryName: string) {
  'use cache'
  cacheLife('routesFlags')
  cacheTag('routes-list')
  cacheTag('route-bike-categories')

  return db
    .select({ route: routes, translation: routeTranslations })
    .from(routes)
    .innerJoin(
      routeTranslations,
      and(eq(routeTranslations.routeId, routes.id), eq(routeTranslations.locale, lang))
    )
    .where(and(publiclyListed, sql`${routes.bikeTypes} @> ARRAY[${routeCategoryName}]::text[]`))
    .orderBy(asc(routes.displayOrder), asc(routes.id))
    .limit(3)
}

// Opzioni tipo-bici per il filtro pubblico e per il form admin. Un modulo di
// dati e non una server action: una lettura pubblica dentro un file
// 'use server' diventerebbe un endpoint invocabile da fuori. Il tag è quello
// che le azioni admin in lib/actions/bike-options.ts già invalidano.
export async function getRouteBikeCategoryNames() {
  'use cache'
  cacheLife('routesFlags')
  cacheTag('route-bike-categories')

  const rows = await db
    .select({ name: routeBikeCategories.name })
    .from(routeBikeCategories)
    .orderBy(asc(routeBikeCategories.displayOrder))
  return rows.map((r) => r.name)
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

  // Exclude what the worker hasn't finished — videos and photos alike — and
  // carry the resolved manifest URL down so the client doesn't have to guess
  // which one exists. resolveReadyMedia and loadGpxPoints already have their own
  // durable, near-permanent Upstash cache (lib/cache.ts) — this "use cache"
  // wrapper is a thin, short-lived layer on top, not a replacement for it. It
  // is also why a photo that has just finished appears within its 30-120
  // seconds, without anything invalidating the tag.
  const allMedia = await resolveReadyMedia(permittedMedia)

  const gpxPoints =
    mediaFlags.routeFlyover && route.gpxKey
      ? await loadGpxPoints(route.gpxKey, route.updatedAt)
      : []

  return { route, translation, allMedia, gpxPoints }
}
