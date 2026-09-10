import 'server-only'
import { and, eq, sql } from 'drizzle-orm'
import { cacheLife, cacheTag } from 'next/cache'
import { db, routes, routeTranslations, routePhotos } from '@/lib/db'
import type { Route, RouteTranslation, RoutePhoto } from '@/lib/db'
import type { Locale } from '@/app/[lang]/dictionaries'

/**
 * The database reads behind the public routes pages, cached.
 *
 * These pages are gated on a feature flag, which is request-time data, so the
 * pages themselves cannot be prerendered — the flag is read at every request by
 * design. What can be avoided is asking Supabase the same questions again for
 * every visitor: a route and its translations change when an admin saves them,
 * and not otherwise.
 *
 * `use cache: remote` rather than plain `use cache`: on Vercel each request may
 * land on a different instance, and `use cache` keeps its entries in that
 * instance's memory. A cache that starts empty on most requests would leave the
 * queries exactly where they are today.
 *
 * Freshness comes from tags, not from waiting: the admin actions in
 * `lib/actions/routes.ts` call `updateTag` after every write, so a saved change
 * is visible on the next request. The one-hour `cacheLife` is the backstop for
 * a write that somehow escapes tagging — it is also, finally, the hour that
 * `export const revalidate = 3600` was asking for and never got.
 */

/**
 * One tag for all of it. There are a handful of routes, an admin saves one at a
 * time, and rebuilding every entry costs three queries — finer-grained tags
 * would buy nothing and give the actions a way to forget one.
 */
export const ROUTES_TAG = 'routes'

export interface RouteWithTranslation {
  route: Route
  translation: RouteTranslation
}

/**
 * Published routes with their translation for `locale`, in one cache entry per
 * locale. Routes with no translation for that locale are left out, exactly as
 * the page did when it filtered them itself.
 */
export async function listPublishedRoutes(locale: Locale): Promise<RouteWithTranslation[]> {
  'use cache: remote'
  cacheTag(ROUTES_TAG)
  cacheLife('hours')

  const rows = await db
    .select({ route: routes, translation: routeTranslations })
    .from(routes)
    .innerJoin(
      routeTranslations,
      and(eq(routeTranslations.routeId, routes.id), eq(routeTranslations.locale, locale))
    )
    .where(eq(routes.isPublished, true))

  return rows
}

/**
 * A published route addressed by its 8-character short id, with the translation
 * for `locale`. Null when there is no such published route.
 *
 * The translation may be missing while the route exists — a freshly created
 * route before Azure Translator has answered — so it is optional here and the
 * page falls back to the id, as it did before.
 */
export async function getPublishedRoute(
  shortId: string,
  locale: Locale
): Promise<{ route: Route; translation: RouteTranslation | undefined } | null> {
  'use cache: remote'
  cacheTag(ROUTES_TAG)
  cacheLife('hours')

  const [route] = await db
    .select()
    .from(routes)
    .where(and(sql`left(${routes.id}::text, 8) = ${shortId}`, eq(routes.isPublished, true)))

  if (!route) return null

  const [translation] = await db
    .select()
    .from(routeTranslations)
    .where(and(eq(routeTranslations.routeId, route.id), eq(routeTranslations.locale, locale)))

  return { route, translation }
}

/**
 * A route's photos and videos, in display order.
 *
 * Keyed by the route's UUID rather than its short id: both the detail page and
 * the cards on the list ask for this, and both already hold the full id, so
 * they share one entry.
 */
export async function listRouteMedia(routeId: string): Promise<RoutePhoto[]> {
  'use cache: remote'
  cacheTag(ROUTES_TAG)
  cacheLife('hours')

  return db
    .select()
    .from(routePhotos)
    .where(eq(routePhotos.routeId, routeId))
    .orderBy(routePhotos.displayOrder)
}
