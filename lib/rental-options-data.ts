import { and, asc, eq } from 'drizzle-orm'
import { db, bikeModelTranslations, bikeSizes, bikeUnits, bikeVersions } from '@/lib/db'
import { inGarage } from '@/lib/in-garage'
import type { RentalOption, RentalSize } from '@/lib/rental-options'

/**
 * Every combination of model, size and version that has at least one bike in the shop, grouped
 * as model → sizes → versions. A bike that is already retired does not count; one that will only
 * be retired in the future still does (it can be rented until then). Published or not: a bike
 * that is physically in the shop can be rented. One query, no per-model loop.
 */
export async function getRentalOptions(): Promise<RentalOption[]> {
  const rows = await db
    .selectDistinct({
      modelId: bikeUnits.bikeModelId,
      modelName: bikeModelTranslations.name,
      sizeId: bikeSizes.id,
      sizeName: bikeSizes.name,
      sizeOrder: bikeSizes.displayOrder,
      versionId: bikeVersions.id,
      versionName: bikeVersions.name,
      versionOrder: bikeVersions.displayOrder,
    })
    .from(bikeUnits)
    .leftJoin(
      bikeModelTranslations,
      and(eq(bikeModelTranslations.bikeModelId, bikeUnits.bikeModelId), eq(bikeModelTranslations.locale, 'it')),
    )
    .innerJoin(bikeSizes, eq(bikeSizes.id, bikeUnits.bikeSizeId))
    .innerJoin(bikeVersions, eq(bikeVersions.id, bikeUnits.bikeVersionId))
    .where(inGarage())
    .orderBy(
      asc(bikeModelTranslations.name), asc(bikeUnits.bikeModelId),
      asc(bikeSizes.displayOrder), asc(bikeSizes.name),
      asc(bikeVersions.displayOrder), asc(bikeVersions.name),
    )

  const models = new Map<string, { option: RentalOption; sizes: Map<string, RentalSize> }>()
  for (const row of rows) {
    let model = models.get(row.modelId)
    if (!model) {
      model = { option: { modelId: row.modelId, modelName: row.modelName ?? 'Untitled', sizes: [] }, sizes: new Map() }
      models.set(row.modelId, model)
    }
    let size = model.sizes.get(row.sizeId)
    if (!size) {
      size = { id: row.sizeId, name: row.sizeName, versions: [] }
      model.sizes.set(row.sizeId, size)
      model.option.sizes.push(size)
    }
    size.versions.push({ id: row.versionId, name: row.versionName })
  }
  return [...models.values()].map((model) => model.option)
}
