import { and, asc, eq, exists, gt, inArray, isNull, or } from 'drizzle-orm'
import { db, bikeCategories, bikeModelTranslations, bikeModels, bikeSizes, bikeUnits, bikeVersions } from '@/lib/db'
import { daysBetween, type DayRange } from '@/lib/dates'
import { safeErrorSummary } from '@/lib/safe-error'
import { getFreeBikes } from './availability'
import { paymentsAvailable } from './payments'
import { stayPriceCents } from './pricing'
import { settleOverdueHolds } from './settle'

type Locale = 'it' | 'en' | 'de'

export interface BookableVersion {
  versionId: string
  versionName: string
  /** Bikes of this model, size and version free for the whole stay: the most that can be asked for. */
  free: number
}

export interface BookableVariant {
  sizeId: string
  sizeName: string
  /** The version is asked for only where a size has more than one with a bike free (today there is only "Unisex"). */
  chooseVersion: boolean
  versions: BookableVersion[]
}

export interface BookableModel {
  id: string
  name: string
  /** The category the booking page puts the model under (in the order the panel gave the categories). */
  categoryId: string
  categoryName: string
  days: number
  /** The price of the whole stay for one bike, or null when the category does not rent that many days. */
  stayPriceCents: number | null
  maxDays: number
  tooLong: boolean
  totalFree: number
  variants: BookableVariant[]
}

/** Settles the bookings whose time has run out so held bikes are free again at once. A courtesy, never a reason to fail: an error is logged. */
export async function settleHoldsQuietly(): Promise<void> {
  if (!paymentsAvailable()) return
  try {
    await settleOverdueHolds()
  } catch (error) {
    console.error('[booking] could not settle the holds before listing', { error: safeErrorSummary(error) })
  }
}

/**
 * The published models that have a bike free for the whole of `range`, with their sizes and versions, how many are free of each, and
 * the price of the stay: what the booking page shows. The price is the server's (`stayPriceCents`), the same that will be charged.
 *
 * Before counting, the bookings whose time has run out are settled, so bikes held for a payment that never came are free again
 * without waiting for the sweeper's next minute. That is a courtesy and never a reason to fail: an error there is logged and the page
 * is built with what the database says.
 * `includeUnavailable` keeps the published models that have bikes in the shop but none free for these days (with no variants), so the page can show them switched off.
 */
export async function listBookableBikes(
  range: DayRange, lang: Locale, options: { includeUnavailable?: boolean } = {},
): Promise<BookableModel[]> {
  await settleHoldsQuietly()

  const free = await getFreeBikes(range)
  const freeIds = [...new Set(free.map((row) => row.bikeModelId))]
  // By default only the models with a bike free; with `includeUnavailable` every published model, the ones with none free switched off.
  // A model with no bike in the shop at all (none, or all retired by then) is not "taken": it does not exist for the customer.
  const modelIds = options.includeUnavailable
    ? (await db.select({ id: bikeModels.id }).from(bikeModels).where(and(
      eq(bikeModels.isPublished, true),
      exists(db.select({ id: bikeUnits.id }).from(bikeUnits).where(and(
        eq(bikeUnits.bikeModelId, bikeModels.id),
        or(isNull(bikeUnits.retiredOn), gt(bikeUnits.retiredOn, range.startsOn)),
      ))),
    ))).map((row) => row.id)
    : freeIds
  if (modelIds.length === 0) return []

  const models = await db
    .select({ id: bikeModels.id, percent: bikeModels.priceAdjustmentPercent, order: bikeModels.displayOrder, category: bikeCategories })
    .from(bikeModels)
    .innerJoin(bikeCategories, eq(bikeCategories.id, bikeModels.categoryId))
    .where(inArray(bikeModels.id, modelIds))
    .orderBy(asc(bikeCategories.displayOrder), asc(bikeCategories.name), asc(bikeCategories.id), asc(bikeModels.displayOrder), asc(bikeModels.createdAt))
  const names = await db
    .select({ modelId: bikeModelTranslations.bikeModelId, locale: bikeModelTranslations.locale, name: bikeModelTranslations.name })
    .from(bikeModelTranslations)
    .where(inArray(bikeModelTranslations.bikeModelId, modelIds))
  const sizes = new Map((await db.select().from(bikeSizes).orderBy(asc(bikeSizes.displayOrder), asc(bikeSizes.name))).map((s, index) => [s.id, { ...s, index }]))
  const versions = new Map((await db.select().from(bikeVersions).orderBy(asc(bikeVersions.displayOrder), asc(bikeVersions.name))).map((v, index) => [v.id, { ...v, index }]))

  const days = daysBetween(range.startsOn, range.endsOn)
  return models.map((model) => {
    const own = names.filter((entry) => entry.modelId === model.id)
    const name = (own.find((entry) => entry.locale === lang) ?? own.find((entry) => entry.locale === 'it') ?? own[0])?.name ?? model.category.name
    const price = stayPriceCents(model.category, days, Number(model.percent))

    const bySize = new Map<string, BookableVersion[]>()
    for (const row of free.filter((entry) => entry.bikeModelId === model.id)) {
      const version = versions.get(row.bikeVersionId)
      if (!version) continue
      bySize.set(row.bikeSizeId, [...(bySize.get(row.bikeSizeId) ?? []), { versionId: version.id, versionName: version.name, free: row.free }])
    }
    const variants = [...bySize.entries()]
      .flatMap(([sizeId, list]) => {
        const size = sizes.get(sizeId)
        return size ? [{ size, list }] : []
      })
      .sort((a, b) => a.size.index - b.size.index)
      .map(({ size, list }) => ({
        sizeId: size.id,
        sizeName: size.name,
        chooseVersion: list.length > 1,
        versions: list.sort((a, b) => (versions.get(a.versionId)?.index ?? 0) - (versions.get(b.versionId)?.index ?? 0)),
      }))

    return {
      id: model.id,
      name,
      categoryId: model.category.id,
      categoryName: model.category.name,
      days,
      stayPriceCents: price,
      maxDays: model.category.maxRentalDays,
      tooLong: price === null,
      totalFree: variants.reduce((sum, variant) => sum + variant.versions.reduce((s, v) => s + v.free, 0), 0),
      variants,
    }
  })
}

export interface FocusModel { id: string; name: string; categoryName: string }

/** The model a person arrived from (`/rent?model=…`): only a published one, or null (an old or typed link falls back to booking by days). */
export async function getFocusModel(modelId: string, lang: Locale): Promise<FocusModel | null> {
  const [row] = await db
    .select({ id: bikeModels.id, category: bikeCategories })
    .from(bikeModels)
    .innerJoin(bikeCategories, eq(bikeCategories.id, bikeModels.categoryId))
    .where(and(eq(bikeModels.id, modelId), eq(bikeModels.isPublished, true)))
  if (!row) return null
  const names = await db
    .select({ locale: bikeModelTranslations.locale, name: bikeModelTranslations.name })
    .from(bikeModelTranslations)
    .where(eq(bikeModelTranslations.bikeModelId, modelId))
  const name = (names.find((entry) => entry.locale === lang) ?? names.find((entry) => entry.locale === 'it') ?? names[0])?.name ?? row.category.name
  return { id: row.id, name, categoryName: row.category.name }
}
