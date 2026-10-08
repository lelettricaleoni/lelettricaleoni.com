import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, bikeCategories, bikeModels, bikeModelTranslations } from '@/lib/db'
import { quoteBikes } from '@/lib/booking/quote'
import { createFixture, type Fixture } from './fixtures'

describe('quoteBikes', () => {
  let fx: Fixture
  beforeEach(async () => {
    fx = await createFixture(1)
    const [model] = await db.select().from(bikeModels).where(eq(bikeModels.id, fx.modelId))
    await db.update(bikeCategories).set({ day1Price: '10', day2Price: '18', day3Price: '24', maxRentalDays: 3 })
      .where(eq(bikeCategories.id, model.categoryId))
    await db.update(bikeModels).set({ isPublished: true }).where(eq(bikeModels.id, fx.modelId))
    await db.insert(bikeModelTranslations).values([
      { bikeModelId: fx.modelId, locale: 'it', name: 'Bici di prova', description: 'd' },
      { bikeModelId: fx.modelId, locale: 'de', name: 'Testrad', description: 'd' },
    ])
  })
  afterEach(async () => { await fx.cleanup() })

  const spec = () => ({ bikeModelId: fx.modelId, bikeSizeId: fx.sizeId, bikeVersionId: fx.versionId })

  it('prices every bike for the whole stay, in cents, with its name in the language asked', async () => {
    const result = await quoteBikes([spec(), spec()], 2, { language: 'de' })
    expect(result).toEqual({
      status: 'ok',
      lines: [{ ...spec(), amountCents: 1800, label: 'Testrad' }, { ...spec(), amountCents: 1800, label: 'Testrad' }],
      totalCents: 3600,
    })
  })

  it('falls back to the Italian name when the language has none, and to the category name when nothing is translated', async () => {
    const english = await quoteBikes([spec()], 1, { language: 'en' })
    expect(english.status === 'ok' && english.lines[0].label).toBe('Bici di prova')
    await db.delete(bikeModelTranslations).where(eq(bikeModelTranslations.bikeModelId, fx.modelId))
    const bare = await quoteBikes([spec()], 1, { language: 'it' })
    expect(bare.status === 'ok' && bare.lines[0].label).toMatch(/^db-test-/)
  })

  it("applies the model's own percentage and rounds to the whole euro, as the shop does", async () => {
    await db.update(bikeModels).set({ priceAdjustmentPercent: '10' }).where(eq(bikeModels.id, fx.modelId))
    const result = await quoteBikes([spec()], 3)
    expect(result.status === 'ok' && result.lines[0].amountCents).toBe(2600) // 24 + 10% = 26.40 -> 26
  })

  it('names the line whose model the category cannot rent for that long', async () => {
    expect(await quoteBikes([spec(), spec()], 4)).toEqual({ status: 'too_many_days', lineIndex: 0, maxDays: 3 })
  })

  it('names the line with a model that does not exist, or that is not published', async () => {
    const stranger = { ...spec(), bikeModelId: crypto.randomUUID() }
    expect(await quoteBikes([spec(), stranger], 1)).toEqual({ status: 'unknown_bike', lineIndex: 1 })
    await db.update(bikeModels).set({ isPublished: false }).where(eq(bikeModels.id, fx.modelId))
    expect(await quoteBikes([spec()], 1)).toEqual({ status: 'unknown_bike', lineIndex: 0 })
    expect((await quoteBikes([spec()], 1, { publishedOnly: false })).status).toBe('ok')
  })
})
