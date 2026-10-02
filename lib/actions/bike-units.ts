'use server'
import { eq, and, desc } from 'drizzle-orm'
import {
  db, bikeUnits, bikeModels, bikeModelTranslations, bikeModelSizes, bikeModelVersions,
  bikeSizes, bikeVersions,
} from '@/lib/db'
import { getAdminUser } from '@/lib/supabase/server'
import { updateTag } from 'next/cache'
import { deleteBikeUnitUnlessReserved, restoreBikeUnit, retireBikeUnit } from '@/lib/reservations'
import { bikeUnitIdSchema, retireBikeSchema, type ActionInvalid } from '@/lib/reservation-schemas'

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

export async function deleteBikeUnitAction(id: string): Promise<{ ok: true } | { ok: false; reason: 'has_reservations' }> {
  await requireAdmin()
  const result = await deleteBikeUnitUnlessReserved(id)
  if (result.status === 'has_reservations') return { ok: false, reason: 'has_reservations' }
  updateTag('bike-units')
  return { ok: true }
}

export async function retireBikeUnitAction(input: unknown): Promise<Awaited<ReturnType<typeof retireBikeUnit>> | ActionInvalid> {
  await requireAdmin()
  const parsed = retireBikeSchema.safeParse(input)
  if (!parsed.success) {
    const dateProblem = parsed.error.issues.some((issue) => issue.path[0] === 'retiredOn')
    return { status: 'invalid', message: dateProblem ? 'That is not a valid date' : 'Invalid bike' }
  }
  const result = await retireBikeUnit(parsed.data.id, parsed.data.retiredOn)
  // The public site stops listing the bike (and maybe its model): the cached lists must follow.
  if (result.status === 'retired') updateTag('bike-units')
  return result
}

export async function restoreBikeUnitAction(input: unknown): Promise<Awaited<ReturnType<typeof restoreBikeUnit>> | ActionInvalid> {
  await requireAdmin()
  const parsed = bikeUnitIdSchema.safeParse(input)
  if (!parsed.success) return { status: 'invalid', message: 'Invalid bike' }
  const result = await restoreBikeUnit(parsed.data.id)
  if (result.status === 'restored') updateTag('bike-units')
  return result
}
