'use server'
import { eq, and, desc } from 'drizzle-orm'
import {
  db, bikeUnits, bikeModels, bikeModelTranslations, bikeModelSizes, bikeModelVersions,
  bikeSizes, bikeVersions,
} from '@/lib/db'
import { getAdminUser } from '@/lib/supabase/server'
import { updateTag } from 'next/cache'

async function requireAdmin() {
  const user = await getAdminUser()
  if (!user) throw new Error('Unauthorized')
}

export async function getBikeUnitsForAdmin() {
  await requireAdmin()
  return db
    .select({
      unit: bikeUnits,
      modelName: bikeModelTranslations.name,
      sizeName: bikeSizes.name,
      versionName: bikeVersions.name,
    })
    .from(bikeUnits)
    .leftJoin(
      bikeModelTranslations,
      and(eq(bikeModelTranslations.bikeModelId, bikeUnits.bikeModelId), eq(bikeModelTranslations.locale, 'it'))
    )
    .innerJoin(bikeSizes, eq(bikeSizes.id, bikeUnits.bikeSizeId))
    .innerJoin(bikeVersions, eq(bikeVersions.id, bikeUnits.bikeVersionId))
    .orderBy(desc(bikeUnits.createdAt))
}

/**
 * Every published model, each with the subset of global sizes/versions it
 * actually allows — exactly what "Il mio negozio"'s add-a-bike form needs to
 * restrict its two dropdowns once a model is picked. One query per list
 * (models, then their size/version links), not one query per model: the
 * same N+1 shape that hung /routes twice must not be reintroduced here.
 */
export async function getPublishedModelsWithAllowedOptions() {
  await requireAdmin()

  const models = await db
    .select({ model: bikeModels, name: bikeModelTranslations.name })
    .from(bikeModels)
    .leftJoin(
      bikeModelTranslations,
      and(eq(bikeModelTranslations.bikeModelId, bikeModels.id), eq(bikeModelTranslations.locale, 'it'))
    )
    .where(eq(bikeModels.isPublished, true))

  const sizeLinks = await db
    .select({ bikeModelId: bikeModelSizes.bikeModelId, size: bikeSizes })
    .from(bikeModelSizes)
    .innerJoin(bikeSizes, eq(bikeSizes.id, bikeModelSizes.bikeSizeId))

  const versionLinks = await db
    .select({ bikeModelId: bikeModelVersions.bikeModelId, version: bikeVersions })
    .from(bikeModelVersions)
    .innerJoin(bikeVersions, eq(bikeVersions.id, bikeModelVersions.bikeVersionId))

  return models.map(({ model, name }) => ({
    model,
    name: name ?? 'Untitled',
    allowedSizes: sizeLinks.filter((l) => l.bikeModelId === model.id).map((l) => l.size),
    allowedVersions: versionLinks.filter((l) => l.bikeModelId === model.id).map((l) => l.version),
  }))
}

export async function createBikeUnitAction(bikeModelId: string, bikeSizeId: string, bikeVersionId: string) {
  await requireAdmin()

  // Re-checked server-side, not trusted from the client: the size/version
  // must actually be in this model's allowed set, not just any global one.
  const [sizeAllowed] = await db.select().from(bikeModelSizes).where(
    and(eq(bikeModelSizes.bikeModelId, bikeModelId), eq(bikeModelSizes.bikeSizeId, bikeSizeId))
  )
  const [versionAllowed] = await db.select().from(bikeModelVersions).where(
    and(eq(bikeModelVersions.bikeModelId, bikeModelId), eq(bikeModelVersions.bikeVersionId, bikeVersionId))
  )
  if (!sizeAllowed || !versionAllowed) {
    throw new Error('That size or version is not offered by this model')
  }

  await db.insert(bikeUnits).values({ bikeModelId, bikeSizeId, bikeVersionId })
  updateTag('bike-units')
}

export async function deleteBikeUnitAction(id: string) {
  await requireAdmin()
  await db.delete(bikeUnits).where(eq(bikeUnits.id, id))
  updateTag('bike-units')
}
