import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { db, bikeModelSizes, bikeSizes, bikeUnits, bikeVersions } from '@/lib/db'
import { getRentalOptions } from '@/lib/rental-options-data'
import { addDaysTo, todayInRome } from '@/lib/dates'
import { createFixture, type Fixture } from './fixtures'

/**
 * What the rental form offers must come from the bikes that are really in the shop, not from
 * the sizes and versions a model is allowed to have on paper.
 */
describe('getRentalOptions', () => {
  let fx: Fixture
  let sizeM: string
  let versionY: string
  const extraUnits: string[] = []

  beforeEach(async () => {
    fx = await createFixture(1) // one bike: size S (fx.sizeId), version X (fx.versionId)
    const tag = `db-test-${crypto.randomUUID()}`
    ;[{ id: sizeM }] = await db.insert(bikeSizes).values({ name: `${tag}-M` }).returning()
    ;[{ id: versionY }] = await db.insert(bikeVersions).values({ name: `${tag}-Y` }).returning()
    const units = await db.insert(bikeUnits).values([
      { bikeModelId: fx.modelId, bikeSizeId: fx.sizeId, bikeVersionId: versionY },   // S + Y
      { bikeModelId: fx.modelId, bikeSizeId: sizeM, bikeVersionId: fx.versionId },   // M + X
    ]).returning()
    extraUnits.push(...units.map((u) => u.id))
  })

  afterEach(async () => {
    await db.delete(bikeUnits).where(inArray(bikeUnits.id, extraUnits))
    extraUnits.length = 0
    await fx.cleanup()
    await db.delete(bikeSizes).where(eq(bikeSizes.id, sizeM))
    await db.delete(bikeVersions).where(eq(bikeVersions.id, versionY))
  })

  const mine = async () => (await getRentalOptions()).find((option) => option.modelId === fx.modelId)

  it('lists the sizes the shop has, and for each size only the versions the shop has of it', async () => {
    const option = await mine()
    expect(option).toBeDefined()
    const sizes = Object.fromEntries(option!.sizes.map((s) => [s.id, s.versions.map((v) => v.id).sort()]))
    expect(Object.keys(sizes).sort()).toEqual([fx.sizeId, sizeM].sort())
    expect(sizes[fx.sizeId]).toEqual([fx.versionId, versionY].sort()) // S exists in X and in Y
    expect(sizes[sizeM]).toEqual([fx.versionId])                      // M exists in X only
  })

  it('does not offer a size nobody has in the shop, even if the model allows it', async () => {
    // Size L is allowed by the model on paper, but there is no bike of that size.
    const [sizeL] = await db.insert(bikeSizes).values({ name: `db-test-${crypto.randomUUID()}-L` }).returning()
    await db.insert(bikeModelSizes).values({ bikeModelId: fx.modelId, bikeSizeId: sizeL.id })
    try {
      const ids = (await mine())!.sizes.map((size) => size.id)
      expect(ids).not.toContain(sizeL.id)
      expect(ids.sort()).toEqual([fx.sizeId, sizeM].sort())
    } finally {
      await db.delete(bikeModelSizes).where(eq(bikeModelSizes.bikeSizeId, sizeL.id))
      await db.delete(bikeSizes).where(eq(bikeSizes.id, sizeL.id))
    }
  })

  it('names the model, and includes one that is not published', async () => {
    const option = await mine()
    expect(option!.modelName).toBe('Untitled') // the fixture has no translation
  })

  it('leaves out a model with no bike in the shop', async () => {
    const empty = await createFixture(0)
    try {
      expect((await getRentalOptions()).some((o) => o.modelId === empty.modelId)).toBe(false)
    } finally {
      await empty.cleanup()
    }
  })

  it('stops offering a size whose only bike is retired, and a version likewise', async () => {
    await db.update(bikeUnits).set({ retiredOn: addDaysTo(todayInRome(), -1) }).where(eq(bikeUnits.id, extraUnits[1]))
    const option = await mine()
    expect(option!.sizes.map((s) => s.id)).toEqual([fx.sizeId])
  })

  it('still offers a bike that will only be retired in the future', async () => {
    await db.update(bikeUnits).set({ retiredOn: addDaysTo(todayInRome(), 30) }).where(eq(bikeUnits.id, extraUnits[1]))
    const option = await mine()
    expect(option!.sizes.map((s) => s.id).sort()).toEqual([fx.sizeId, sizeM].sort())
  })
})
