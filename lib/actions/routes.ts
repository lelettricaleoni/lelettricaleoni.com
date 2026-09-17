'use server'
import { updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db, routes, routeTranslations, media } from '@/lib/db'
import { getAdminUser } from '@/lib/supabase/server'
import { translateFromItalian } from './translate'
import { deleteR2Object, getPresignedUploadUrl } from '@/lib/r2'
import { getVideoPresignedUploadUrl, deleteR2Prefix, deriveHlsPrefix } from '@/lib/media'
import { needsRetranslation } from '@/lib/translations'
import { shortRouteId } from '@/lib/utils'

const RouteSchema = z.object({
  nameIt:          z.string().min(2).max(200),
  descriptionIt:   z.string().min(10),
  difficulty:      z.enum(['easy', 'medium', 'hard', 'expert']),
  distanceKm:      z.coerce.number().positive().optional(),
  elevationM:      z.coerce.number().nonnegative().int().optional(),
  durationMin:     z.coerce.number().positive().int().optional(),
  bikeTypes:       z.array(z.string()).min(1),
  stravaUrl:       z.string().url().optional().or(z.literal('')),
  komootUrl:       z.string().url().optional().or(z.literal('')),
  gpxKey:          z.string().optional(),
})

export type RouteFormState = {
  errors?: Partial<Record<keyof z.infer<typeof RouteSchema>, string[]>>
  message?: string
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

async function requireAdmin() {
  const user = await getAdminUser()
  if (!user) throw new Error('Unauthorized')
}

// One query, not one-plus-N: this used to fetch every route, then fire a
// separate translation lookup per route through Promise.all — the same
// pattern that hung /routes in production on 2026-09-15 (see STATE.md),
// just on the admin list instead of the public one. Left join, not inner:
// unlike the public list this must never drop a route for lacking a
// translation — the caller already falls back to the slug when name is null.
export async function getRoutesForAdmin() {
  await requireAdmin()
  return db
    .select({ route: routes, name: routeTranslations.name })
    .from(routes)
    .leftJoin(
      routeTranslations,
      and(eq(routeTranslations.routeId, routes.id), eq(routeTranslations.locale, 'it'))
    )
    .orderBy(desc(routes.createdAt))
}

export async function getRouteWithDetails(id: string) {
  await requireAdmin()
  const [route] = await db.select().from(routes).where(eq(routes.id, id))
  if (!route) return null

  const translations = await db
    .select()
    .from(routeTranslations)
    .where(eq(routeTranslations.routeId, id))

  const photos = await db
    .select()
    .from(media)
    .where(eq(media.routeId, id))
    .orderBy(media.displayOrder)

  return { route, translations, photos }
}

export async function createRouteAction(
  _prev: RouteFormState,
  formData: FormData
): Promise<RouteFormState> {
  await requireAdmin()

  const bikeTypes = formData.getAll('bikeTypes') as string[]
  const mediaItemsRaw = formData.get('mediaItems') as string | null
  const mediaItems: { key: string; type: 'photo' | 'video' }[] = mediaItemsRaw ? JSON.parse(mediaItemsRaw) : []
  const raw = {
    nameIt:          formData.get('nameIt'),
    descriptionIt:   formData.get('descriptionIt'),
    difficulty:      formData.get('difficulty'),
    distanceKm:      formData.get('distanceKm') || undefined,
    elevationM:      formData.get('elevationM') || undefined,
    durationMin:     formData.get('durationMin') || undefined,
    bikeTypes,
    stravaUrl:       formData.get('stravaUrl') || undefined,
    komootUrl:       formData.get('komootUrl') || undefined,
    gpxKey:          formData.get('gpxKey') || undefined,
  }

  const parsed = RouteSchema.safeParse(raw)
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const { nameIt, descriptionIt, ...routeData } = parsed.data

  const slug = slugify(nameIt)
  const [newRoute] = await db.insert(routes).values({
    slug,
    difficulty: routeData.difficulty,
    distanceKm: routeData.distanceKm?.toString(),
    elevationM: routeData.elevationM,
    durationMin: routeData.durationMin,
    bikeTypes: routeData.bikeTypes,
    stravaUrl: routeData.stravaUrl || null,
    komootUrl: routeData.komootUrl || null,
    gpxKey: routeData.gpxKey || null,
  }).returning()

  const [nameTranslations, descTranslations] = await Promise.all([
    translateFromItalian(nameIt),
    translateFromItalian(descriptionIt),
  ])

  await db.insert(routeTranslations).values([
    { routeId: newRoute.id, locale: 'it', name: nameIt, description: descriptionIt, isAutoTranslated: false },
    { routeId: newRoute.id, locale: 'en', name: nameTranslations.en, description: descTranslations.en, isAutoTranslated: true },
    { routeId: newRoute.id, locale: 'de', name: nameTranslations.de, description: descTranslations.de, isAutoTranslated: true },
  ])

  if (mediaItems.length > 0) {
    await db.insert(media).values(
      mediaItems.map(({ key, type }, displayOrder) => ({
        routeId: newRoute.id, storageKey: key, mediaType: type, displayOrder,
      }))
    )
  }

  updateTag('routes-list')
  updateTag('sitemap')
  updateTag(`route-${shortRouteId(newRoute.id)}`)
  redirect('/manage/routes')
}

export async function updateRouteAction(
  id: string,
  _prev: RouteFormState,
  formData: FormData
): Promise<RouteFormState> {
  await requireAdmin()

  const bikeTypes = formData.getAll('bikeTypes') as string[]
  const mediaItemsRaw = formData.get('mediaItems') as string | null
  const mediaItems: { key: string; type: 'photo' | 'video' }[] = mediaItemsRaw ? JSON.parse(mediaItemsRaw) : []
  const raw = {
    nameIt:          formData.get('nameIt'),
    descriptionIt:   formData.get('descriptionIt'),
    difficulty:      formData.get('difficulty'),
    distanceKm:      formData.get('distanceKm') || undefined,
    elevationM:      formData.get('elevationM') || undefined,
    durationMin:     formData.get('durationMin') || undefined,
    bikeTypes,
    stravaUrl:       formData.get('stravaUrl') || undefined,
    komootUrl:       formData.get('komootUrl') || undefined,
    gpxKey:          formData.get('gpxKey') || undefined,
  }

  const parsed = RouteSchema.safeParse(raw)
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const { nameIt, descriptionIt, ...routeData } = parsed.data
  const slug = slugify(nameIt)

  await db.update(routes).set({
    slug,
    difficulty: routeData.difficulty,
    distanceKm: routeData.distanceKm?.toString(),
    elevationM: routeData.elevationM,
    durationMin: routeData.durationMin,
    bikeTypes: routeData.bikeTypes,
    stravaUrl: routeData.stravaUrl || null,
    komootUrl: routeData.komootUrl || null,
    gpxKey: routeData.gpxKey || null,
    updatedAt: new Date(),
  }).where(eq(routes.id, id))

  const oldMedia = await db.select().from(media).where(eq(media.routeId, id))
  const newKeys = new Set(mediaItems.map((i) => i.key))
  const removed = oldMedia.filter((m) => !newKeys.has(m.storageKey))
  await Promise.all(removed.map((m) =>
    m.mediaType === 'video'
      ? Promise.all([deleteR2Object(m.storageKey), deleteR2Prefix(deriveHlsPrefix(m.storageKey))])
      : deleteR2Object(m.storageKey)
  ))

  await db.delete(media).where(eq(media.routeId, id))
  if (mediaItems.length > 0) {
    await db.insert(media).values(
      mediaItems.map(({ key, type }, displayOrder) => ({
        routeId: id, storageKey: key, mediaType: type, displayOrder,
      }))
    )
  }

  // The Italian text decides whether EN and DE are regenerated. Leaving that to
  // a switch meant an edit could silently leave the other two languages saying
  // something the Italian no longer says.
  const [currentIt] = await db.select().from(routeTranslations).where(
    and(eq(routeTranslations.routeId, id), eq(routeTranslations.locale, 'it'))
  )
  const reTranslate = needsRetranslation(
    currentIt ? { name: currentIt.name, description: currentIt.description ?? '' } : undefined,
    { name: nameIt, description: descriptionIt },
    formData.get('retranslate') === 'true'
  )
  if (reTranslate) {
    const [nameT, descT] = await Promise.all([
      translateFromItalian(nameIt),
      translateFromItalian(descriptionIt),
    ])
    for (const [locale, name, desc, isAuto] of [
      ['it', nameIt, descriptionIt, false],
      ['en', nameT.en, descT.en, true],
      ['de', nameT.de, descT.de, true],
    ] as const) {
      await db
        .update(routeTranslations)
        .set({ name, description: desc, isAutoTranslated: isAuto })
        .where(and(eq(routeTranslations.routeId, id), eq(routeTranslations.locale, locale)))
    }
  } else {
    await db
      .update(routeTranslations)
      .set({ name: nameIt, description: descriptionIt })
      .where(and(eq(routeTranslations.routeId, id), eq(routeTranslations.locale, 'it')))
  }

  updateTag('routes-list')
  updateTag('sitemap')
  updateTag(`route-${shortRouteId(id)}`)
  redirect('/manage/routes')
}

export async function deleteRouteAction(id: string) {
  await requireAdmin()

  const [route] = await db.select().from(routes).where(eq(routes.id, id))
  if (!route) return

  const existingMedia = await db.select().from(media).where(eq(media.routeId, id))
  await Promise.all(existingMedia.map((m) =>
    m.mediaType === 'video'
      ? Promise.all([deleteR2Object(m.storageKey), deleteR2Prefix(deriveHlsPrefix(m.storageKey))])
      : deleteR2Object(m.storageKey)
  ))
  if (route.gpxKey) await deleteR2Object(route.gpxKey)

  await db.delete(routes).where(eq(routes.id, id))

  updateTag('routes-list')
  updateTag('sitemap')
}

export async function togglePublishAction(id: string, isPublished: boolean) {
  await requireAdmin()
  const [route] = await db
    .update(routes)
    .set({ isPublished, updatedAt: new Date() })
    .where(eq(routes.id, id))
    .returning()

  updateTag('routes-list')
  updateTag('sitemap')
  if (route) updateTag(`route-${shortRouteId(route.id)}`)
}

/**
 * Off the routes list, not off the site: the detail page keeps working at
 * its own URL. Independent of isPublished — an unpublished route already
 * disappears everywhere, this is only for a published one you don't want
 * offered up but still want reachable by link.
 */
export async function toggleUnlistedAction(id: string, unlisted: boolean) {
  await requireAdmin()
  const [route] = await db
    .update(routes)
    .set({ unlisted, updatedAt: new Date() })
    .where(eq(routes.id, id))
    .returning()

  updateTag('routes-list')
  updateTag('sitemap')
  if (route) updateTag(`route-${shortRouteId(route.id)}`)
}

export async function getPresignedUploadUrlAction(
  routeId: string,
  fileName: string,
  contentType: string,
  type: 'photo' | 'gpx'
) {
  await requireAdmin()
  const ext = fileName.split('.').pop()
  const key = type === 'gpx'
    ? `route-gpx/${routeId}/track.gpx`
    : `route-photos/${routeId}/${crypto.randomUUID()}.${ext}`
  const url = await getPresignedUploadUrl(key, contentType)
  return { url, key }
}

export async function getVideoPresignedUploadUrlAction(
  routeId: string,
  fileName: string,
  contentType: string
) {
  await requireAdmin()
  const ext = fileName.split('.').pop() ?? 'mp4'
  const key = `private/route-videos/${routeId}/${crypto.randomUUID()}.${ext}`
  const url = await getVideoPresignedUploadUrl(key, contentType)
  return { url, key }
}

export async function savePhotosAction(
  routeId: string,
  photos: { storageKey: string; displayOrder: number; altText?: string }[]
) {
  await requireAdmin()
  await db.delete(media).where(eq(media.routeId, routeId))
  if (photos.length > 0) {
    await db.insert(media).values(
      photos.map((p) => ({ routeId, ...p }))
    )
  }
  const [route] = await db.select().from(routes).where(eq(routes.id, routeId))
  if (route) updateTag(`route-${shortRouteId(route.id)}`)
}
