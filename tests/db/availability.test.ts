import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, bikeModels, bikeUnits } from '@/lib/db'
import { getFreeBikes } from '@/lib/booking/availability'
import { createFixture, insertBooking, insertOnlineLine, type Fixture } from './fixtures'

const RANGE = { startsOn: '2031-10-06', endsOn: '2031-10-09' }

describe('getFreeBikes', () => {
  let fx: Fixture
  beforeEach(async () => { fx = await createFixture(3) })
  afterEach(async () => { await fx.cleanup() })

  const mine = async (options?: { publishedOnly?: boolean }, range = RANGE) =>
    (await getFreeBikes(range, options)).find((row) => row.bikeModelId === fx.modelId)

  async function occupy(unitId: string, status: 'held' | 'confirmed' | 'expired' | 'cancelled', range = RANGE) {
    // Availability reads the bikes, not the booking; a confirmed booking each keeps a customer's "one pending at a time" out of the way.
    const booking = await insertBooking(fx.customerId, range, { status: 'confirmed' })
    await insertOnlineLine(booking, fx.customerId, unitId, range, status)
  }

  it('counts the free bikes of a model, size and version', async () => {
    expect(await mine({ publishedOnly: false })).toEqual({
      bikeModelId: fx.modelId, bikeSizeId: fx.sizeId, bikeVersionId: fx.versionId, free: 3,
    })
  })

  it('takes away a bike that is held and a bike that is confirmed, and none that is expired or cancelled', async () => {
    await occupy(fx.unitIds[0], 'held')
    await occupy(fx.unitIds[1], 'expired')
    expect((await mine({ publishedOnly: false }))?.free).toBe(2)
    await occupy(fx.unitIds[2], 'confirmed')
    expect((await mine({ publishedOnly: false }))?.free).toBe(1)
  })

  it('does not count a bike whose reservation only touches the range (the end is exclusive)', async () => {
    await occupy(fx.unitIds[0], 'confirmed', { startsOn: '2031-10-03', endsOn: '2031-10-06' })
    await occupy(fx.unitIds[1], 'confirmed', { startsOn: '2031-10-09', endsOn: '2031-10-12' })
    expect((await mine({ publishedOnly: false }))?.free).toBe(3)
  })

  it('leaves out a combination with no free bike at all', async () => {
    for (const unitId of fx.unitIds) await occupy(unitId, 'held')
    expect(await mine({ publishedOnly: false })).toBeUndefined()
  })

  it('does not offer a bike that is retired before the end of the stay', async () => {
    await db.update(bikeUnits).set({ retiredOn: '2031-10-08' }).where(eq(bikeUnits.id, fx.unitIds[0]))
    expect((await mine({ publishedOnly: false }))?.free).toBe(2)
    await db.update(bikeUnits).set({ retiredOn: '2031-10-09' }).where(eq(bikeUnits.id, fx.unitIds[0]))
    expect((await mine({ publishedOnly: false }))?.free).toBe(3)
  })

  it('shows only published models unless told otherwise', async () => {
    expect(await mine()).toBeUndefined()
    await db.update(bikeModels).set({ isPublished: true }).where(eq(bikeModels.id, fx.modelId))
    expect((await mine())?.free).toBe(3)
  })
})
