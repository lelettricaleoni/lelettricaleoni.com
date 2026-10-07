'use server'
import { updateTag, revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { eq, and, asc } from 'drizzle-orm'
import {
  db, bikeModels, bikeModelTranslations, bikeModelSizes, bikeModelVersions, media,
} from '@/lib/db'
import { getAdminUser } from '@/lib/supabase/server'
import { getVideoPresignedUploadUrl, getPhotoPresignedUploadUrl, deleteMediaFiles } from '@/lib/media'
import { photoSourceExtension, photoContentType } from '@/lib/media-client'
import { needsRetranslation } from '@/lib/translations'
import { BikeModelSchema, type BikeModelInput } from '@/lib/bike-model-schema'
import { translateNameAndDescription } from '@/lib/translate-text'
import {
  syncModelSizesAndVersions, replaceModelMedia, replaceModelTranslations, type ModelMediaItem,
} from '@/lib/bike-model-sync'
import { FOREIGN_KEY_VIOLATION, pgErrorCode } from '@/lib/pg-errors'

export type BikeModelFormState = {
  errors?: Partial<Record<keyof BikeModelInput, string[]>>
  message?: string
}

const NOT_SAVED = 'The model could not be saved, and nothing was created. Try again.'
const PARTLY_SAVED = 'The changes could not be saved completely. Reload the page and check the model before trying again.'
const MEDIA_UNREADABLE = 'The photos and videos could not be read from the form. Reload the page and try again.'

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

/**
 * The media list the form carries, or null when it cannot be read. A field that
 * is missing means "no media"; one that is there but broken must not be taken
 * for an empty list, which would delete every picture of the model.
 */
function readMediaItems(formData: FormData): ModelMediaItem[] | null {
  const raw = formData.get('mediaItems')
  if (typeof raw !== 'string' || raw === '') return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ModelMediaItem[]) : null
  } catch {
    return null
  }
}

/** The files of media rows that are gone. Runs AFTER the database is right: a failure here only leaves a stray file. */
async function deleteRemovedMediaFiles(removed: Awaited<ReturnType<typeof replaceModelMedia>>) {
  const results = await Promise.allSettled(removed.map(deleteMediaFiles))
  for (const result of results) {
    if (result.status === 'rejected') console.error('[bike-models] could not delete a removed file:', String(result.reason).replace(/[\r\n]/g, ' '))
  }
}

export async function createBikeModelAction(
  _prev: BikeModelFormState,
  formData: FormData
): Promise<BikeModelFormState> {
  await requireAdmin()

  const parsed = parseBikeModelForm(formData)
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors }

  const { nameIt, descriptionIt, sizeIds, versionIds, ...modelData } = parsed.data

  const mediaItems = readMediaItems(formData)
  if (!mediaItems) return { message: MEDIA_UNREADABLE }

  // Translate BEFORE writing anything: the row used to be inserted first, so a failed
  // translation left a model with no name behind, and every retry left another.
  const translated = await translateNameAndDescription(nameIt, descriptionIt)
  if (!translated.ok) return { message: translated.message }

  let newModelId: string | undefined
  try {
    const [newModel] = await db.insert(bikeModels).values({
      categoryId:     modelData.categoryId,
      priceSurcharge: modelData.priceSurcharge?.toString(),
      batteryRange:   modelData.batteryRange || null,
      motor:          modelData.motor || null,
      gearCount:      modelData.gearCount || null,
    }).returning()
    newModelId = newModel.id

    await db.insert(bikeModelTranslations).values([
      { bikeModelId: newModel.id, locale: 'it', name: nameIt, description: descriptionIt, isAutoTranslated: false },
      { bikeModelId: newModel.id, locale: 'en', name: translated.name.en, description: translated.description.en, isAutoTranslated: true },
      { bikeModelId: newModel.id, locale: 'de', name: translated.name.de, description: translated.description.de, isAutoTranslated: true },
    ])
    await syncModelSizesAndVersions(newModel.id, sizeIds, versionIds)
    await replaceModelMedia(newModel.id, mediaItems)
  } catch (error) {
    console.error('[bike-models] create failed:', String(error).replace(/[\r\n]/g, ' '))
    // No transaction is available (see lib/bike-model-sync.ts), so undo by hand: translations,
    // sizes, versions and media go with the model (ON DELETE CASCADE).
    if (newModelId) await db.delete(bikeModels).where(eq(bikeModels.id, newModelId)).catch(() => {})
    return { message: NOT_SAVED }
  }

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

  const mediaItems = readMediaItems(formData)
  if (!mediaItems) return { message: MEDIA_UNREADABLE }

  // Everything that can refuse comes first. The model row used to be updated before the
  // translation was tried, so a translation that failed left the changes half applied.
  const current = await db.select().from(bikeModelTranslations).where(eq(bikeModelTranslations.bikeModelId, id))
  const currentIt = current.find((t) => t.locale === 'it')
  // A model missing a language (a half-created one has none) is translated whatever the
  // text says: comparing the Italian with itself would never notice.
  const incomplete = (['it', 'en', 'de'] as const).some((locale) => !current.some((t) => t.locale === locale))
  const reTranslate = incomplete || needsRetranslation(
    currentIt ? { name: currentIt.name, description: currentIt.description } : undefined,
    { name: nameIt, description: descriptionIt },
    formData.get('retranslate') === 'true'
  )
  let translated: Awaited<ReturnType<typeof translateNameAndDescription>> | null = null
  if (reTranslate) {
    translated = await translateNameAndDescription(nameIt, descriptionIt)
    if (!translated.ok) return { message: translated.message }
  }

  let removedMedia: Awaited<ReturnType<typeof replaceModelMedia>>
  try {
    await db.update(bikeModels).set({
      categoryId:     modelData.categoryId,
      priceSurcharge: modelData.priceSurcharge?.toString(),
      batteryRange:   modelData.batteryRange || null,
      motor:          modelData.motor || null,
      gearCount:      modelData.gearCount || null,
      updatedAt:      new Date(),
    }).where(eq(bikeModels.id, id))

    if (translated?.ok) {
      // Rewritten, not updated: an UPDATE of rows that do not exist saves nothing and says so to nobody.
      await replaceModelTranslations(id, [
        { locale: 'it', name: nameIt, description: descriptionIt, isAutoTranslated: false },
        { locale: 'en', name: translated.name.en, description: translated.description.en, isAutoTranslated: true },
        { locale: 'de', name: translated.name.de, description: translated.description.de, isAutoTranslated: true },
      ])
    } else {
      await db
        .update(bikeModelTranslations)
        .set({ name: nameIt, description: descriptionIt })
        .where(and(eq(bikeModelTranslations.bikeModelId, id), eq(bikeModelTranslations.locale, 'it')))
    }

    await syncModelSizesAndVersions(id, sizeIds, versionIds)
    removedMedia = await replaceModelMedia(id, mediaItems)
  } catch (error) {
    console.error('[bike-models] update failed:', String(error).replace(/[\r\n]/g, ' '))
    return { message: PARTLY_SAVED }
  }
  // Only now, with the database right, are the files of removed pictures deleted.
  await deleteRemovedMediaFiles(removedMedia)

  updateTag('bike-models')
  updateTag(`bike-model-${id}`)
  revalidatePath('/manage/bikes') // the admin list, see deleteBikeModelAction
  redirect('/manage/bikes')
}

export type DeleteBikeModelResult = { ok: true } | { ok: false; reason: 'has-bikes' }

export async function deleteBikeModelAction(id: string): Promise<DeleteBikeModelResult> {
  await requireAdmin()

  const items = await db.select().from(media).where(eq(media.bikeModelId, id))

  // The row goes first, and the files only after: with a bike_units row still pointing at the
  // model (no cascade on that foreign key, by design) the delete is refused, and the pictures
  // must still be there. Deleting the files first, as this did, left a model with photos that
  // no longer existed. Only that refusal is an answer; any other failure is an error and is
  // thrown, instead of being reported as "bikes in the shop".
  try {
    await db.delete(bikeModels).where(eq(bikeModels.id, id))
  } catch (error) {
    if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) return { ok: false, reason: 'has-bikes' }
    throw error
  }
  await deleteRemovedMediaFiles(items)

  updateTag('bike-models')
  // The tag above is for the public pages. The admin list reads the database
  // directly, so it is only redone if the page itself is revalidated: without
  // this the row kept its old state until the panel was reloaded.
  revalidatePath('/manage/bikes')
  return { ok: true }
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
