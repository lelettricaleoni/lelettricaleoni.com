'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db, routes, routeTranslations, routePhotos } from '@/lib/db'
import { getAdminUser } from '@/lib/supabase/server'
import { translateFromItalian } from './translate'
import { deleteR2Object, getPresignedUploadUrl } from '@/lib/r2'
import { getVideoPresignedUploadUrl, deleteMinioObject } from '@/lib/minio'
import { shortRouteId } from '@/lib/utils'

const RouteSchema = z.object({
  nameIt:          z.string().min(2).max(200),
  descriptionIt:   z.string().min(10),
  difficulty:      z.enum(['easy', 'medium', 'hard', 'expert']),
  distanceKm:      z.coerce.number().positive().optional(),
  elevationM:      z.coerce.number().nonnegative().int().optional(),
  durationMin:     z.coerce.number().positive().int().optional(),
  surface:         z.enum(['asphalt', 'dirt', 'mixed']),
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

export async function getRoutesForAdmin() {
  await requireAdmin()
  return db
    .select()
    .from(routes)
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
    .from(routePhotos)
    .where(eq(routePhotos.routeId, id))
    .orderBy(routePhotos.displayOrder)

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
    surface:         formData.get('surface'),
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
    surface: routeData.surface,
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
    await db.insert(routePhotos).values(
      mediaItems.map(({ key, type }, displayOrder) => ({
        routeId: newRoute.id, storageKey: key, mediaType: type, displayOrder,
      }))
    )
  }

  revalidatePath('/[lang]/routes', 'page')
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
    surface:         formData.get('surface'),
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
    surface: routeData.surface,
    bikeTypes: routeData.bikeTypes,
    stravaUrl: routeData.stravaUrl || null,
    komootUrl: routeData.komootUrl || null,
    gpxKey: routeData.gpxKey || null,
    updatedAt: new Date(),
  }).where(eq(routes.id, id))

  await db.delete(routePhotos).where(eq(routePhotos.routeId, id))
  if (mediaItems.length > 0) {
    await db.insert(routePhotos).values(
      mediaItems.map(({ key, type }, displayOrder) => ({
        routeId: id, storageKey: key, mediaType: type, displayOrder,
      }))
    )
  }

  const reTranslate = formData.get('retranslate') === 'true'
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

  revalidatePath('/[lang]/routes', 'page')
  revalidatePath(`/[lang]/routes/${shortRouteId(id)}`, 'page')
  redirect('/manage/routes')
}

export async function deleteRouteAction(id: string) {
  await requireAdmin()

  const [route] = await db.select().from(routes).where(eq(routes.id, id))
  if (!route) return

  const media = await db.select().from(routePhotos).where(eq(routePhotos.routeId, id))
  await Promise.all(media.map((m) =>
    m.mediaType === 'video' ? deleteMinioObject(m.storageKey) : deleteR2Object(m.storageKey)
  ))
  if (route.gpxKey) await deleteR2Object(route.gpxKey)

  await db.delete(routes).where(eq(routes.id, id))

  revalidatePath('/[lang]/routes', 'page')
}

export async function togglePublishAction(id: string, isPublished: boolean) {
  await requireAdmin()
  const [route] = await db
    .update(routes)
    .set({ isPublished, updatedAt: new Date() })
    .where(eq(routes.id, id))
    .returning()

  revalidatePath('/[lang]/routes', 'page')
  if (route) revalidatePath(`/[lang]/routes/${shortRouteId(route.id)}`, 'page')
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
  await db.delete(routePhotos).where(eq(routePhotos.routeId, routeId))
  if (photos.length > 0) {
    await db.insert(routePhotos).values(
      photos.map((p) => ({ routeId, ...p }))
    )
  }
  const [route] = await db.select().from(routes).where(eq(routes.id, routeId))
  if (route) revalidatePath(`/[lang]/routes/${shortRouteId(route.id)}`, 'page')
}
