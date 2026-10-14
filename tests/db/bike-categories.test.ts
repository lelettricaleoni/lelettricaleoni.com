import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { db, bikeCategories, bikeModels } from '@/lib/db'
import { nextCategoryOrder, reorderBikeCategories } from '@/lib/bike-categories'
import { createFixture, type Fixture } from './fixtures'

describe('the order of the bike categories', () => {
  let fixtures: Fixture[]
  let categoryIds: string[]
  beforeEach(async () => {
    fixtures = [await createFixture(0), await createFixture(0), await createFixture(0)]
    // Each fixture has a category of its own: found through its model.
    const models = await db.select({ id: bikeModels.id, categoryId: bikeModels.categoryId }).from(bikeModels)
      .where(inArray(bikeModels.id, fixtures.map((fixture) => fixture.modelId)))
    categoryIds = fixtures.map((fixture) => models.find((model) => model.id === fixture.modelId)!.categoryId)
  })
  afterEach(async () => { for (const fixture of fixtures) await fixture.cleanup() })

  const orderOf = async () => {
    const rows = await db.select({ id: bikeCategories.id, order: bikeCategories.displayOrder }).from(bikeCategories).where(inArray(bikeCategories.id, categoryIds))
    return categoryIds.map((id) => rows.find((row) => row.id === id)!.order)
  }

  it('puts the categories in the order given', async () => {
    const [a, b, c] = categoryIds
    await reorderBikeCategories([c, a, b])
    const [orderA, orderB, orderC] = await orderOf()
    expect(orderC).toBeLessThan(orderA)
    expect(orderA).toBeLessThan(orderB)
  })

  it('leaves alone a category that is not in the list, and ignores an id that is not a category', async () => {
    const [a, b, c] = categoryIds
    await db.update(bikeCategories).set({ displayOrder: 777 }).where(eq(bikeCategories.id, c))
    await reorderBikeCategories([b, a, crypto.randomUUID()])
    const [orderA, orderB, orderC] = await orderOf()
    expect(orderB).toBe(0)
    expect(orderA).toBe(1)
    expect(orderC).toBe(777)
  })

  it('refuses a list that is not a list of ids, and an empty one changes nothing', async () => {
    await expect(reorderBikeCategories(['not-an-id'])).rejects.toThrow()
    await expect(reorderBikeCategories('x')).rejects.toThrow()
    const before = await orderOf()
    await reorderBikeCategories([])
    expect(await orderOf()).toEqual(before)
  })

  it('gives a new category the place after the last one', async () => {
    await db.update(bikeCategories).set({ displayOrder: 41 }).where(eq(bikeCategories.id, categoryIds[0]))
    expect(await nextCategoryOrder()).toBeGreaterThanOrEqual(42)
  })
})
