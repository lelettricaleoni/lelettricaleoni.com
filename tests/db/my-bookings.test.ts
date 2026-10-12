import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, bikeModelTranslations, bikeReservations, bookingRefunds, bookings, customers } from '@/lib/db'
import { getMyBooking, listMyBookings } from '@/lib/booking/my-bookings'
import { createFixture, insertBooking, insertOnlineLine, insertPaidBooking, type Fixture } from './fixtures'

const FAR = { startsOn: '2031-12-10', endsOn: '2031-12-13' } // 10th to 12th included
const PAST = { startsOn: '2031-01-10', endsOn: '2031-01-12' }
const TODAY = '2031-11-01'
const NOW = new Date('2031-11-01T10:00:00Z')

describe('the bookings of a customer, as Account rents shows them', () => {
  let fx: Fixture
  const strangers: string[] = []
  beforeEach(async () => {
    fx = await createFixture(3)
    await db.insert(bikeModelTranslations).values([
      { bikeModelId: fx.modelId, locale: 'it', name: 'Bici di prova', description: 'd' },
      { bikeModelId: fx.modelId, locale: 'de', name: 'Testrad', description: 'd' },
    ])
  })
  afterEach(async () => {
    await fx.cleanup()
    for (const id of strangers.splice(0)) await db.delete(customers).where(eq(customers.id, id))
  })

  it('lists the paid bookings that are still to come, with their bikes and what each costs', async () => {
    const paid = await insertPaidBooking(fx, FAR, [3000, 4000])
    const { upcoming, past } = await listMyBookings(fx.customerId, 'it', { today: TODAY, now: NOW })
    expect(past).toEqual([])
    expect(upcoming).toHaveLength(1)
    expect(upcoming[0]).toMatchObject({ id: paid.bookingId, status: 'confirmed', startsOn: '2031-12-10', lastDay: '2031-12-12', totalCents: 7000 })
    expect(upcoming[0].bikes.map((b) => [b.amountCents, b.modelName, b.status])).toEqual([[3000, 'Bici di prova', 'confirmed'], [4000, 'Bici di prova', 'confirmed']])
    expect(upcoming[0].bikes[0].sizeName).toMatch(/^db-test-/)
  })

  it('names the model in the language asked', async () => {
    await insertPaidBooking(fx, FAR, [3000])
    const { upcoming } = await listMyBookings(fx.customerId, 'de', { today: TODAY, now: NOW })
    expect(upcoming[0].bikes[0].modelName).toBe('Testrad')
  })

  it('says until when a bike can be cancelled with a refund, and whether it can be now', async () => {
    await insertPaidBooking(fx, FAR, [3000])
    const before = (await listMyBookings(fx.customerId, 'it', { today: TODAY, now: NOW })).upcoming[0].bikes[0]
    expect(before.refundableUntil.toISOString()).toBe('2031-12-08T08:00:00.000Z') // 09:00 in Rome, two days before the 10th
    expect(before.canCancel).toBe(true)
    const after = (await listMyBookings(fx.customerId, 'it', { today: TODAY, now: new Date('2031-12-08T08:00:01Z') })).upcoming[0].bikes[0]
    expect(after.canCancel).toBe(false)
  })

  it('puts a stay that is over, a cancelled booking and a refunded one in the past', async () => {
    await insertPaidBooking(fx, PAST, [1000])
    const cancelled = await insertBooking(fx.customerId, FAR, { status: 'cancelled', lineCount: 1 })
    await insertOnlineLine(cancelled, fx.customerId, fx.unitIds[1], FAR, 'cancelled')
    const { upcoming, past } = await listMyBookings(fx.customerId, 'it', { today: TODAY, now: NOW })
    expect(upcoming).toEqual([])
    expect(past.map((b) => b.status).sort()).toEqual(['cancelled', 'confirmed'])
  })

  it('shows a booking waiting for payment, but not the attempts that expired', async () => {
    const waiting = await insertBooking(fx.customerId, FAR)
    await insertOnlineLine(waiting, fx.customerId, fx.unitIds[0], FAR, 'held')
    await insertBooking(fx.customerId, FAR, { status: 'expired' })
    const { upcoming } = await listMyBookings(fx.customerId, 'it', { today: TODAY, now: NOW })
    expect(upcoming.map((b) => b.status)).toEqual(['pending'])
    expect(upcoming[0].bikes.map((b) => b.status)).toEqual(['held'])
    expect(upcoming[0].bikes[0].canCancel).toBe(false) // it is not paid yet: there is nothing to refund
  })

  it('shows the refund of a bike that was cancelled', async () => {
    const paid = await insertPaidBooking(fx, FAR, [3000, 4000])
    await db.update(bikeReservations).set({ status: 'cancelled' }).where(eq(bikeReservations.id, paid.reservationIds[0]))
    await db.insert(bookingRefunds).values({ reservationId: paid.reservationIds[0], bookingId: paid.bookingId, amountCents: 3000, reason: 'customer', status: 'succeeded' })
    const { upcoming } = await listMyBookings(fx.customerId, 'it', { today: TODAY, now: NOW })
    const [first, second] = upcoming[0].bikes
    expect(first).toMatchObject({ status: 'cancelled', refund: { amountCents: 3000, status: 'succeeded' }, canCancel: false })
    expect(second).toMatchObject({ status: 'confirmed', refund: null, canCancel: true })
  })

  it('does not show the bookings of somebody else', async () => {
    const [stranger] = await db.insert(customers).values({ firstName: 'db-test', lastName: `other-${crypto.randomUUID()}` }).returning()
    strangers.push(stranger.id)
    await insertPaidBooking(fx, FAR, [3000])
    const theirs = await listMyBookings(stranger.id, 'it', { today: TODAY, now: NOW })
    expect(theirs.upcoming).toEqual([])
    expect(theirs.past).toEqual([])
  })

  it('opens one booking of the customer, and none of anybody else’s, even with its id', async () => {
    const paid = await insertPaidBooking(fx, FAR, [3000])
    const [stranger] = await db.insert(customers).values({ firstName: 'db-test', lastName: `other-${crypto.randomUUID()}` }).returning()
    strangers.push(stranger.id)
    expect(await getMyBooking(fx.customerId, paid.bookingId, 'it', { today: TODAY, now: NOW })).toMatchObject({ id: paid.bookingId })
    expect(await getMyBooking(stranger.id, paid.bookingId, 'it', { today: TODAY, now: NOW })).toBeNull()
    expect(await getMyBooking(fx.customerId, crypto.randomUUID(), 'it', { today: TODAY, now: NOW })).toBeNull()
  })

  it('leaves out a booking that expired when opened by id', async () => {
    const expired = await insertBooking(fx.customerId, FAR, { status: 'expired' })
    expect(await getMyBooking(fx.customerId, expired, 'it', { today: TODAY, now: NOW })).toBeNull()
    expect((await db.select().from(bookings).where(eq(bookings.id, expired))).length).toBe(1)
  })
})
