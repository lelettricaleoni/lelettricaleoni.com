'use server'
import { updateTag, revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { eq, and, asc } from 'drizzle-orm'
import {
  db, bikeModels, bikeModelTranslations, bikeModelSizes, bikeModelVersions, media,
} from '@/lib/db'
import { getAdminUser } from '@/lib/supabase/server'
import { translateFromItalian } from './translate'
import { getVideoPresignedUploadUrl, getPhotoPresignedUploadUrl, deleteMediaFiles } from '@/lib/media'
import { photoSourceExtension, photoContentType } from '@/lib/media-client'
import { needsRetranslation } from '@/lib/translations'

const BikeModelSchema = z.object({
  nameIt:          z.string().min(2).max(200),
  descriptionIt:   z.string().min(10),
  categoryId:      z.string().uuid(),
  priceSurcharge:  z.coerce.number().nonnegative().optional(),
  batteryRange:    z.string().optional(),
  motor:           z.string().optional(),
  gearCount:       z.string().optional(),
  sizeIds:         z.array(z.string().uuid()).min(1, 'Select at least one size'),
  versionIds:      z.array(z.string().uuid()).min(1, 'Select at least one version'),
})

export type BikeModelFormState = {
  errors?: Partial<Record<keyof z.infer<typeof BikeModelSchema>, string[]>>
  message?: string
}

async function requireAdmin() {
  const user = await getAdminUser()
  if (!user) throw new Error('Unauthorized')
}

export async function getBikeModelsForAdmin() {
  await requireAdmin()
  return db
    .select({ model: bikeModels, name: bikeModelTranslations.name })
    .from(bikeModels)
    .leftJoin(
      bikeModelTranslations,
      and(eq(bikeModelTranslations.bikeModelId, bikeModels.id), eq(bikeModelTranslations.locale, 'it'))
    )
    .orderBy(asc(bikeModels.displayOrder))
}

export async function getBikeModelWithDetails(id: string) {
  await requireAdmin()
  const [model] = await db.select().from(bikeModels).where(eq(bikeModels.id, id))
  if (!model) return null

  const translations = await db.select().from(bikeModelTranslations).where(eq(bikeModelTranslations.bikeModelId, id))
  const sizeLinks = await db.select().from(bikeModelSizes).where(eq(bikeModelSizes.bikeModelId, id))
  const versionLinks = await db.select().from(bikeModelVersions).where(eq(bikeModelVersions.bikeModelId, id))
  const photos = await db.select().from(media).where(eq(media.bikeModelId, id))

  return {
    model,
    translations,
    sizeIds: sizeLinks.map((l) => l.bikeSizeId),
    versionIds: versionLinks.map((l) => l.bikeVersionId),
    photos,
  }
}

function parseBikeModelForm(formData: FormData) {
  return BikeModelSchema.safeParse({
    nameIt:         formData.get('nameIt'),
    descriptionIt:  formData.get('descriptionIt'),
    categoryId:     formData.get('categoryId'),
    priceSurcharge: formData.get('priceSurcharge') || undefined,
    batteryRange:   formData.get('batteryRange') || undefined,
    motor:          formData.get('motor') || undefined,
    gearCount:      formData.get('gearCount') || undefined,
    sizeIds:        formData.getAll('sizeIds'),
    versionIds:     formData.getAll('versionIds'),
  })
}

async function syncMediaItems(bikeModelId: string, formData: FormData) {
  const mediaItemsRaw = formData.get('mediaItems') as string | null
  const mediaItems: { key: string; type: 'photo' | 'video'; sha256?: string }[] = mediaItemsRaw ? JSON.parse(mediaItemsRaw) : []

  const existing = await db.select().from(media).where(eq(media.bikeModelId, bikeModelId))
  const newKeys = new Set(mediaItems.map((i) => i.key))
  const removed = existing.filter((m) => !newKeys.has(m.storageKey))
  await Promise.all(removed.map(deleteMediaFiles))

  await db.delete(media).where(eq(media.bikeModelId, bikeModelId))
  if (mediaItems.length > 0) {
    await db.insert(media).values(
      mediaItems.map(({ key, type, sha256 }, displayOrder) => ({
        bikeModelId, storageKey: key, mediaType: type, displayOrder, sha256: sha256 ?? null,
      }))
    )
  }
}

async function syncSizesAndVersions(bikeModelId: string, sizeIds: string[], versionIds: string[]) {
  await db.delete(bikeModelSizes).where(eq(bikeModelSizes.bikeModelId, bikeModelId))
  await db.insert(bikeModelSizes).values(sizeIds.map((bikeSizeId) => ({ bikeModelId, bikeSizeId })))

  await db.delete(bikeModelVersions).where(eq(bikeModelVersions.bikeModelId, bikeModelId))
  await db.insert(bikeModelVersions).values(versionIds.map((bikeVersionId) => ({ bikeModelId, bikeVersionId })))
}

export async function createBikeModelAction(
  _prev: BikeModelFormState,
  formData: FormData
): Promise<BikeModelFormState> {
  await requireAdmin()

  const parsed = parseBikeModelForm(formData)
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors }

  const { nameIt, descriptionIt, sizeIds, versionIds, ...modelData } = parsed.data

  const [newModel] = await db.insert(bikeModels).values({
    categoryId:     modelData.categoryId,
    priceSurcharge: modelData.priceSurcharge?.toString(),
    batteryRange:   modelData.batteryRange || null,
    motor:          modelData.motor || null,
    gearCount:      modelData.gearCount || null,
  }).returning()

  const [nameTranslations, descTranslations] = await Promise.all([
    translateFromItalian(nameIt),
    translateFromItalian(descriptionIt),
  ])

  await db.insert(bikeModelTranslations).values([
    { bikeModelId: newModel.id, locale: 'it', name: nameIt, description: descriptionIt, isAutoTranslated: false },
    { bikeModelId: newModel.id, locale: 'en', name: nameTranslations.en, description: descTranslations.en, isAutoTranslated: true },
    { bikeModelId: newModel.id, locale: 'de', name: nameTranslations.de, description: descTranslations.de, isAutoTranslated: true },
  ])

  await syncSizesAndVersions(newModel.id, sizeIds, versionIds)
  await syncMediaItems(newModel.id, formData)

  updateTag('bike-models')
  revalidatePath('/manage/bikes') // the admin list, see deleteBikeModelAction
  redirect('/manage/bikes')
}

export async function updateBikeModelAction(
  id: string,
  _prev: BikeModelFormState,
  formData: FormData
): Promise<BikeModelFormState> {
  await requireAdmin()

  const parsed = parseBikeModelForm(formData)
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors }

  const { nameIt, descriptionIt, sizeIds, versionIds, ...modelData } = parsed.data

  await db.update(bikeModels).set({
    categoryId:     modelData.categoryId,
    priceSurcharge: modelData.priceSurcharge?.toString(),
    batteryRange:   modelData.batteryRange || null,
    motor:          modelData.motor || null,
    gearCount:      modelData.gearCount || null,
    updatedAt:      new Date(),
  }).where(eq(bikeModels.id, id))

  const [currentIt] = await db.select().from(bikeModelTranslations).where(
    and(eq(bikeModelTranslations.bikeModelId, id), eq(bikeModelTranslations.locale, 'it'))
  )
  const reTranslate = needsRetranslation(
    currentIt ? { name: currentIt.name, description: currentIt.description } : undefined,
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
        .update(bikeModelTranslations)
        .set({ name, description: desc, isAutoTranslated: isAuto })
        .where(and(eq(bikeModelTranslations.bikeModelId, id), eq(bikeModelTranslations.locale, locale)))
    }
  } else {
    await db
      .update(bikeModelTranslations)
      .set({ name: nameIt, description: descriptionIt })
      .where(and(eq(bikeModelTranslations.bikeModelId, id), eq(bikeModelTranslations.locale, 'it')))
  }

  await syncSizesAndVersions(id, sizeIds, versionIds)
  await syncMediaItems(id, formData)

  updateTag('bike-models')
  updateTag(`bike-model-${id}`)
  revalidatePath('/manage/bikes') // the admin list, see deleteBikeModelAction
  redirect('/manage/bikes')
}

export async function deleteBikeModelAction(id: string) {
  await requireAdmin()

  const items = await db.select().from(media).where(eq(media.bikeModelId, id))
  await Promise.all(items.map(deleteMediaFiles))

  // Fails loudly (thrown error, caught by the caller) if any bike_units row
  // still references this model — no cascade on that foreign key, by design.
  await db.delete(bikeModels).where(eq(bikeModels.id, id))
  updateTag('bike-models')
  // The tag above is for the public pages. The admin list reads the database
  // directly, so it is only redone if the page itself is revalidated: without
  // this the row kept its old state until the panel was reloaded.
  revalidatePath('/manage/bikes')
}

export async function togglePublishBikeModelAction(id: string, isPublished: boolean) {
  await requireAdmin()
  await db.update(bikeModels).set({ isPublished, updatedAt: new Date() }).where(eq(bikeModels.id, id))
  updateTag('bike-models')
  updateTag(`bike-model-${id}`)
  revalidatePath('/manage/bikes') // see deleteBikeModelAction
}

/** Staged for the worker, like a route photo: see getPresignedUploadUrlAction in routes.ts. */
export async function getBikeModelPresignedUploadUrlAction(
  bikeModelId: string,
  fileName: string,
  _contentType: string,
  _type: 'photo'
) {
  await requireAdmin()
  const ext = photoSourceExtension(fileName)
  if (!ext) throw new Error(`Unsupported photo format: ${fileName}`)
  const key = `private/bike-model-photos/${bikeModelId}/${crypto.randomUUID()}.${ext}`
  const contentType = photoContentType(ext)
  const url = await getPhotoPresignedUploadUrl(key, contentType)
  return { url, key, contentType }
}

export async function getBikeModelVideoPresignedUploadUrlAction(
  bikeModelId: string,
  fileName: string,
  contentType: string
) {
  await requireAdmin()
  const ext = fileName.split('.').pop() ?? 'mp4'
  const key = `private/bike-model-videos/${bikeModelId}/${crypto.randomUUID()}.${ext}`
  const url = await getVideoPresignedUploadUrl(key, contentType)
  return { url, key }
}

export async function reorderBikeModelsAction(orderedIds: string[]) {
  await requireAdmin()
  for (let displayOrder = 0; displayOrder < orderedIds.length; displayOrder++) {
    await db.update(bikeModels).set({ displayOrder }).where(eq(bikeModels.id, orderedIds[displayOrder]))
  }
  updateTag('bike-models')
}
