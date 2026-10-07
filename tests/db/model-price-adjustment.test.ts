import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { db, bikeModels, bikeCategories } from '@/lib/db'
import { CHECK_VIOLATION, pgErrorCode } from '@/lib/pg-errors'

/** bike_models.price_adjustment_percent (migration 0016): 0 by default, and the range is the database's too. */
let modelId: string

beforeEach(async () => {
  const [category] = await db.select().from(bikeCategories).limit(1)
  const [model] = await db.insert(bikeModels).values({ categoryId: category.id }).returning()
  modelId = model.id
})
afterEach(async () => { await db.delete(bikeModels).where(eq(bikeModels.id, modelId)) })

const setPercent = (value: string) =>
  db.update(bikeModels).set({ priceAdjustmentPercent: value }).where(eq(bikeModels.id, modelId))

describe('bike_models.price_adjustment_percent', () => {
  it('is 0 for a model that never set it', async () => {
    const [row] = await db.select().from(bikeModels).where(eq(bikeModels.id, modelId))
    expect(Number(row.priceAdjustmentPercent)).toBe(0)
  })

  it('keeps a surcharge, a discount and a decimal as written', async () => {
    for (const value of ['10', '-15', '7.5', '300', '-99.99']) {
      await setPercent(value)
      const [row] = await db.select().from(bikeModels).where(eq(bikeModels.id, modelId))
      expect(Number(row.priceAdjustmentPercent)).toBe(Number(value))
    }
  })

  it('refuses a discount of 100% or more and a surcharge above 300%', async () => {
    for (const value of ['-100', '-150', '300.01', '500']) {
      let code: string | undefined
      try { await setPercent(value) } catch (error) { code = pgErrorCode(error) }
      expect(code, `${value} should be refused`).toBe(CHECK_VIOLATION)
    }
  })

  it('is not null: a model always has a percentage', async () => {
    await expect(db.execute(sql`UPDATE bike_models SET price_adjustment_percent = NULL WHERE id = ${modelId}::uuid`)).rejects.toThrow()
  })
})
