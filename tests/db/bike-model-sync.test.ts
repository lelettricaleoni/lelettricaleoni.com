import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { asc, eq, inArray } from 'drizzle-orm'
import {
  db, bikeModels, bikeCategories, bikeSizes, bikeVersions, bikeModelSizes, bikeModelVersions, media,
} from '@/lib/db'
import { replaceModelMedia, syncModelSizesAndVersions } from '@/lib/bike-model-sync'

/**
 * The save of a bike model's sizes, versions and media is one statement each.
 * The two-statement version it replaced (delete all, then insert) left a model
 * with none of them whenever the second statement failed.
 */

let modelId: string
let sizeIds: string[]
let versionIds: string[]

const sizesOf = async () =>
  (await db.select().from(bikeModelSizes).where(eq(bikeModelSizes.bikeModelId, modelId))).map((r) => r.bikeSizeId).sort()
const versionsOf = async () =>
  (await db.select().from(bikeModelVersions).where(eq(bikeModelVersions.bikeModelId, modelId))).map((r) => r.bikeVersionId).sort()

beforeEach(async () => {
  const [category] = await db.select().from(bikeCategories).limit(1)
  sizeIds = (await db.select().from(bikeSizes).limit(3)).map((s) => s.id)
  versionIds = (await db.select().from(bikeVersions).limit(2)).map((v) => v.id)
  if (!category || sizeIds.length < 3 || versionIds.length < 2) throw new Error('the development database needs 3 sizes and 2 versions')
  const [model] = await db.insert(bikeModels).values({ categoryId: category.id }).returning()
  modelId = model.id
})

afterEach(async () => {
  // Sizes, versions and media go with the model (ON DELETE CASCADE).
  await db.delete(bikeModels).where(eq(bikeModels.id, modelId))
})

describe('syncModelSizesAndVersions', () => {
  it('writes the ticked sizes and versions', async () => {
    await syncModelSizesAndVersions(modelId, [sizeIds[0], sizeIds[1]], [versionIds[0]])
    expect(await sizesOf()).toEqual([sizeIds[0], sizeIds[1]].sort())
    expect(await versionsOf()).toEqual([versionIds[0]])
  })

  it('removes what is no longer ticked, adds what is new, and does not touch what stays', async () => {
    await syncModelSizesAndVersions(modelId, [sizeIds[0], sizeIds[1]], [versionIds[0]])
    const [stays] = await db.select().from(bikeModelSizes).where(eq(bikeModelSizes.bikeSizeId, sizeIds[1]))
    const rowId = (await db.select().from(bikeModelSizes).where(eq(bikeModelSizes.bikeModelId, modelId)))
      .find((r) => r.bikeSizeId === sizeIds[1])!.id
    expect(stays).toBeDefined()

    await syncModelSizesAndVersions(modelId, [sizeIds[1], sizeIds[2]], [versionIds[0], versionIds[1]])

    expect(await sizesOf()).toEqual([sizeIds[1], sizeIds[2]].sort())
    expect(await versionsOf()).toEqual([versionIds[0], versionIds[1]].sort())
    const after = (await db.select().from(bikeModelSizes).where(eq(bikeModelSizes.bikeModelId, modelId)))
      .find((r) => r.bikeSizeId === sizeIds[1])!
    expect(after.id, 'a size that stayed ticked was deleted and written again').toBe(rowId)
  })

  it('does not lose anything when the statement fails: all or nothing', async () => {
    await syncModelSizesAndVersions(modelId, [sizeIds[0], sizeIds[1]], [versionIds[0]])
    // A size that does not exist breaks the foreign key AFTER the old rows are marked for deletion.
    const ghost = '00000000-0000-4000-8000-000000000000'
    await expect(syncModelSizesAndVersions(modelId, [sizeIds[2], ghost], [versionIds[1]])).rejects.toThrow()

    expect(await sizesOf(), 'a failed save emptied the sizes').toEqual([sizeIds[0], sizeIds[1]].sort())
    expect(await versionsOf(), 'a failed save emptied the versions').toEqual([versionIds[0]])
  })

  it('is safe to run twice with the same selection', async () => {
    await syncModelSizesAndVersions(modelId, [sizeIds[0]], [versionIds[0]])
    await syncModelSizesAndVersions(modelId, [sizeIds[0]], [versionIds[0]])
    expect(await sizesOf()).toEqual([sizeIds[0]])
    expect(await versionsOf()).toEqual([versionIds[0]])
  })
})

describe('replaceModelMedia', () => {
  const photo = (key: string) => ({ key, type: 'photo' as const })
  const listed = async () =>
    (await db.select().from(media).where(eq(media.bikeModelId, modelId)).orderBy(asc(media.displayOrder))).map((r) => r.storageKey)

  it('writes the list in order', async () => {
    await replaceModelMedia(modelId, [photo('test/a.avif'), photo('test/b.avif'), { key: 'test/c.mp4', type: 'video' }])
    expect(await listed()).toEqual(['test/a.avif', 'test/b.avif', 'test/c.mp4'])
  })

  it('reorders, adds and removes, and returns only the rows that are gone', async () => {
    await replaceModelMedia(modelId, [photo('test/a.avif'), photo('test/b.avif'), photo('test/c.avif')])
    const removed = await replaceModelMedia(modelId, [photo('test/c.avif'), photo('test/a.avif'), photo('test/d.avif')])
    expect(await listed()).toEqual(['test/c.avif', 'test/a.avif', 'test/d.avif'])
    expect(removed.map((r) => r.storageKey)).toEqual(['test/b.avif'])
  })

  it('empties the list when given none', async () => {
    await replaceModelMedia(modelId, [photo('test/a.avif')])
    const removed = await replaceModelMedia(modelId, [])
    expect(await listed()).toEqual([])
    expect(removed).toHaveLength(1)
  })

  it('does not lose the old list when the new one cannot be written', async () => {
    await replaceModelMedia(modelId, [photo('test/a.avif'), photo('test/b.avif')])
    await expect(
      replaceModelMedia(modelId, [photo('test/c.avif'), { key: 'test/d', type: 'gif' as unknown as 'photo' }])
    ).rejects.toThrow()
    expect(await listed(), 'a failed save wiped the media list').toEqual(['test/a.avif', 'test/b.avif'])
  })
})

// Guard for the fixture itself: the test must never run against rows it did not create.
describe('test hygiene', () => {
  it('leaves no model of its own behind', async () => {
    const mine = await db.select().from(bikeModels).where(inArray(bikeModels.id, [modelId]))
    expect(mine).toHaveLength(1)
  })
})
