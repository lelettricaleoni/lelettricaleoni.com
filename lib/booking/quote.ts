import { eq, inArray } from 'drizzle-orm'
import { db, bikeCategories, bikeModels, bikeModelTranslations } from '@/lib/db'
import { stayPriceCents, sumCents } from './pricing'
import type { BikeSpec } from './rules'

export interface QuoteLine extends BikeSpec {
  amountCents: number
  /** The model's name in the customer's language, for the payment page. */
  label: string
}

export type QuoteResult =
  | { status: 'ok'; lines: QuoteLine[]; totalCents: number }
  | { status: 'unknown_bike'; lineIndex: number }
  | { status: 'too_many_days'; lineIndex: number; maxDays: number }

/**
 * What each bike of a cart costs for `days` whole days, from the catalogue: the price list of its category plus the model's own
 * percentage. Always the server's number: the browser shows an estimate and never decides. The first line that cannot be priced is
 * named, so the person is told which one.
 */
export async function quoteBikes(
  specs: BikeSpec[], days: number, options: { language?: string; publishedOnly?: boolean } = {},
): Promise<QuoteResult> {
  const language = options.language ?? 'it'
  const publishedOnly = options.publishedOnly ?? true
  const modelIds = [...new Set(specs.map((spec) => spec.bikeModelId))]

  const models = await db
    .select({ id: bikeModels.id, percent: bikeModels.priceAdjustmentPercent, published: bikeModels.isPublished, category: bikeCategories })
    .from(bikeModels)
    .innerJoin(bikeCategories, eq(bikeCategories.id, bikeModels.categoryId))
    .where(inArray(bikeModels.id, modelIds))
  const names = await db
    .select({ modelId: bikeModelTranslations.bikeModelId, locale: bikeModelTranslations.locale, name: bikeModelTranslations.name })
    .from(bikeModelTranslations)
    .where(inArray(bikeModelTranslations.bikeModelId, modelIds))
  const byId = new Map(models.map((row) => [row.id, row]))

  const lines: QuoteLine[] = []
  for (const [lineIndex, spec] of specs.entries()) {
    const model = byId.get(spec.bikeModelId)
    if (!model || (publishedOnly && !model.published)) return { status: 'unknown_bike', lineIndex }
    const amountCents = stayPriceCents(model.category, days, Number(model.percent))
    if (amountCents === null) return { status: 'too_many_days', lineIndex, maxDays: model.category.maxRentalDays }
    const own = names.filter((entry) => entry.modelId === model.id)
    const label = (own.find((entry) => entry.locale === language) ?? own.find((entry) => entry.locale === 'it') ?? own[0])?.name
      ?? model.category.name
    lines.push({ ...spec, amountCents, label })
  }
  return { status: 'ok', lines, totalCents: sumCents(lines.map((line) => line.amountCents)) }
}
