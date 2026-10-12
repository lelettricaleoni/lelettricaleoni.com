import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq, inArray, sql } from 'drizzle-orm'
import { db, bikeCategories, bikeModelTranslations, bikeModels, bikeReservations, bikeUnits, bikeVersions, bookings } from '@/lib/db'
import { getFocusModel, listBookableBikes } from '@/lib/booking/catalog'
import { createFixture, insertBooking, insertOnlineLine, type Fixture } from './fixtures'

const RANGE = { startsOn: '2031-11-03', endsOn: '2031-11-06' } // 3 days

describe('listBookableBikes', () => {
  let fx: Fixture
  const extraVersions: string[] = []
  beforeEach(async () => {
    fx = await createFixture(3)
    const [model] = await db.select().from(bikeModels).where(eq(bikeModels.id, fx.modelId))
    await db.update(bikeCategories).set({ day1Price: '10', day2Price: '18', day3Price: '24', maxRentalDays: 3 })
      .where(eq(bikeCategories.id, model.categoryId))
    await db.update(bikeModels).set({ isPublished: true }).where(eq(bikeModels.id, fx.modelId))
    await db.insert(bikeModelTranslations).values([
      { bikeModelId: fx.modelId, locale: 'it', name: 'Bici di prova', description: 'd' },
      { bikeModelId: fx.modelId, locale: 'de', name: 'Testrad', description: 'd' },
    ])
  })
  afterEach(async () => {
    // The extra bikes point at the model: they go before the fixture takes the model away.
    if (extraVersions.length) {
      await db.delete(bikeUnits).where(inArray(bikeUnits.bikeVersionId, extraVersions))
    }
    await fx.cleanup()
    if (extraVersions.length) {
      await db.delete(bikeVersions).where(inArray(bikeVersions.id, extraVersions))
      extraVersions.length = 0
    }
  })

  const mine = async (range = RANGE, lang: 'it' | 'en' | 'de' = 'it') =>
    (await listBookableBikes(range, lang)).find((entry) => entry.id === fx.modelId)

  it('lists a published model with its sizes, versions, free bikes and the price of the whole stay', async () => {
    const entry = await mine()
    expect(entry).toMatchObject({ name: 'Bici di prova', days: 3, stayPriceCents: 2400, maxDays: 3, tooLong: false, totalFree: 3 })
    expect(entry?.variants).toHaveLength(1)
    expect(entry?.variants[0]).toMatchObject({ sizeId: fx.sizeId, chooseVersion: false })
    expect(entry?.variants[0].versions).toEqual([{ versionId: fx.versionId, versionName: expect.stringMatching(/^db-test-/), free: 3 }])
  })

  it('names the model in the language asked, falling back to Italian', async () => {
    expect((await mine(RANGE, 'de'))?.name).toBe('Testrad')
    expect((await mine(RANGE, 'en'))?.name).toBe('Bici di prova')
  })

  it('counts only the bikes free for the whole stay: held and confirmed ones are taken, expired and cancelled are not', async () => {
    const booking = await insertBooking(fx.customerId, RANGE) // pending: a held bike belongs to a booking that is still being paid
    await insertOnlineLine(booking, fx.customerId, fx.unitIds[0], RANGE, 'held')
    await insertOnlineLine(booking, fx.customerId, fx.unitIds[1], RANGE, 'expired')
    expect((await mine())?.totalFree).toBe(2)
    await db.update(bookings).set({ status: 'confirmed' }).where(eq(bookings.id, booking))
    await db.update(bikeReservations).set({ status: 'confirmed' }).where(eq(bikeReservations.bookingId, booking))
    expect((await mine())?.totalFree).toBe(1)
  })

  it('leaves the model out when no bike is free, and when it is not published', async () => {
    const booking = await insertBooking(fx.customerId, RANGE, { status: 'confirmed' })
    for (const unit of fx.unitIds) await insertOnlineLine(booking, fx.customerId, unit, RANGE, 'confirmed')
    expect(await mine()).toBeUndefined()
    await db.delete(bikeReservations).where(eq(bikeReservations.bookingId, booking))
    expect(await mine()).toBeDefined()
    await db.update(bikeModels).set({ isPublished: false }).where(eq(bikeModels.id, fx.modelId))
    expect(await mine()).toBeUndefined()
  })

  it('asks for the version only where a size has more than one with a bike free', async () => {
    const [second] = await db.insert(bikeVersions).values({ name: `db-test-second-${crypto.randomUUID()}` }).returning()
    extraVersions.push(second.id)
    await db.insert(bikeUnits).values({ bikeModelId: fx.modelId, bikeSizeId: fx.sizeId, bikeVersionId: second.id })
    const entry = await mine()
    expect(entry?.variants[0].chooseVersion).toBe(true)
    expect(entry?.variants[0].versions.map((v) => v.free).sort()).toEqual([1, 3])
  })

  it('flags a stay longer than the category rents, with no price', async () => {
    const entry = await mine({ startsOn: '2031-11-03', endsOn: '2031-11-08' }) // 5 days, the category rents 3
    expect(entry).toMatchObject({ days: 5, tooLong: true, stayPriceCents: null, maxDays: 3 })
  })

  it('frees the bikes of bookings whose time has run out before counting', async () => {
    const overdue = await insertBooking(fx.customerId, RANGE, { status: 'pending', lineCount: 1 }) // no session
    await insertOnlineLine(overdue, fx.customerId, fx.unitIds[0], RANGE, 'held')
    await db.update(bookings).set({ holdExpiresAt: sql`now() - interval '1 minute'` }).where(eq(bookings.id, overdue))
    expect((await mine())?.totalFree).toBe(3)
    expect((await db.select().from(bookings).where(eq(bookings.id, overdue)))[0].status).toBe('expired')
  })

  it('with includeUnavailable keeps a published model with no bike free, switched off', async () => {
    const booking = await insertBooking(fx.customerId, RANGE)
    for (const unitId of fx.unitIds) await insertOnlineLine(booking, fx.customerId, unitId, RANGE, 'held')
    expect(await mine()).toBeUndefined()
    const all = await listBookableBikes(RANGE, 'it', { includeUnavailable: true })
    expect(all.find((entry) => entry.id === fx.modelId)).toMatchObject({ totalFree: 0, variants: [], tooLong: false })
  })

  it('with includeUnavailable still leaves out a model that is not published', async () => {
    await db.update(bikeModels).set({ isPublished: false }).where(eq(bikeModels.id, fx.modelId))
    const all = await listBookableBikes(RANGE, 'it', { includeUnavailable: true })
    expect(all.find((entry) => entry.id === fx.modelId)).toBeUndefined()
  })

  it('getFocusModel gives the name, category and limit of a published model, and nothing for an unpublished or unknown one', async () => {
    expect(await getFocusModel(fx.modelId, 'it')).toMatchObject({ id: fx.modelId, name: 'Bici di prova', maxDays: 3 })
    expect(await getFocusModel(crypto.randomUUID(), 'it')).toBeNull()
    await db.update(bikeModels).set({ isPublished: false }).where(eq(bikeModels.id, fx.modelId))
    expect(await getFocusModel(fx.modelId, 'it')).toBeNull()
  })
})
