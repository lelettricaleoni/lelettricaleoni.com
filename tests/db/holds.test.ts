import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq, inArray, sql } from 'drizzle-orm'
import { db, bikeReservations, bookings, customers } from '@/lib/db'
import { getFreeBikes } from '@/lib/booking/availability'
import {
  confirmHold, expireBooking, findOverduePending, findPendingBooking, holdOneBike, startHold, type StartHoldInput,
} from '@/lib/booking/holds'
import { createFixture, insertBooking, insertOnlineLine, type Fixture } from './fixtures'

const RANGE = { startsOn: '2031-11-03', endsOn: '2031-11-06' }

describe('holding the bikes of a booking', () => {
  let fx: Fixture
  const others: string[] = []
  beforeEach(async () => { fx = await createFixture(3) })
  afterEach(async () => {
    await fx.cleanup()
    if (others.length) {
      await db.delete(bikeReservations).where(inArray(bikeReservations.customerId, others))
      await db.delete(bookings).where(inArray(bookings.customerId, others))
      await db.delete(customers).where(inArray(customers.id, others))
      others.length = 0
    }
  })

  const lines = (count: number) => Array.from({ length: count }, () => ({
    bikeModelId: fx.modelId, bikeSizeId: fx.sizeId, bikeVersionId: fx.versionId, amountCents: 3000,
  }))
  const input = (overrides: Partial<StartHoldInput> = {}): StartHoldInput => ({
    bookingKey: crypto.randomUUID(), customerId: fx.customerId, ...RANGE, language: 'it', lines: lines(1), ...overrides,
  })
  const free = async () => (await getFreeBikes(RANGE, { publishedOnly: false })).find((r) => r.bikeModelId === fx.modelId)?.free ?? 0
  const linesOf = (bookingId: string) => db.select().from(bikeReservations).where(eq(bikeReservations.bookingId, bookingId))
  const bookingOf = async (bookingId: string) => (await db.select().from(bookings).where(eq(bookings.id, bookingId)))[0]

  async function otherCustomer() {
    const [row] = await db.insert(customers).values({ firstName: 'db-test', lastName: `other-${crypto.randomUUID()}` }).returning()
    others.push(row.id)
    return row.id
  }

  it('holds one bike per line, on different bikes, for thirty minutes', async () => {
    const result = await startHold(input({ lines: lines(2) }))
    if (result.status !== 'held') throw new Error(`expected held, got ${result.status}`)
    expect(result.replayed).toBe(false)

    const held = await linesOf(result.bookingId)
    expect(held).toHaveLength(2)
    expect(new Set(held.map((line) => line.bikeUnitId)).size).toBe(2)
    expect(held.every((line) => line.status === 'held' && line.kind === 'online_rental' && line.customerId === fx.customerId)).toBe(true)
    expect(await free()).toBe(1)

    const booking = await bookingOf(result.bookingId)
    expect(booking).toMatchObject({ status: 'pending', totalCents: 6000, language: 'it', ...RANGE })
    const minutes = (booking.holdExpiresAt.getTime() - Date.now()) / 60_000
    expect(minutes).toBeGreaterThan(28)
    expect(minutes).toBeLessThanOrEqual(30.5)
  })

  it('replays: asking again with the same key finds the same booking and holds nothing more', async () => {
    const request = input({ lines: lines(2) })
    const first = await startHold(request)
    const second = await startHold(request)
    if (first.status !== 'held' || second.status !== 'held') throw new Error('expected held twice')
    expect(second.replayed).toBe(true)
    expect(second.bookingId).toBe(first.bookingId)
    expect(await linesOf(first.bookingId)).toHaveLength(2)
    expect(await free()).toBe(1)
  })

  it('says a replay of a booking that is no longer pending is closed, and holds nothing', async () => {
    const request = input()
    const first = await startHold(request)
    if (first.status !== 'held') throw new Error('setup')
    await expireBooking(first.bookingId)
    const again = await startHold(request)
    expect(again).toEqual({ status: 'closed', bookingId: first.bookingId, bookingStatus: 'expired' })
    expect(await free()).toBe(3)
  })

  it('is all or nothing: three bikes asked, two free, nothing stays held and the missing line is named', async () => {
    const taker = await otherCustomer()
    await startHold(input({ customerId: taker, lines: lines(1) })) // one bike gone: two free
    expect(await free()).toBe(2)

    const result = await startHold(input({ lines: lines(3) }))
    expect(result).toEqual({ status: 'unavailable', lineIndex: 2 })
    expect(await free()).toBe(2)
    const mine = await db.select().from(bookings).where(eq(bookings.customerId, fx.customerId))
    expect(mine.filter((b) => b.status === 'pending')).toHaveLength(0)
    const stillHeld = await db.select().from(bikeReservations).where(eq(bikeReservations.customerId, fx.customerId))
    expect(stillHeld.filter((line) => line.status === 'held')).toHaveLength(0)
  })

  it('race for the last bike: two customers, one bike, exactly one wins', async () => {
    const solo = await createFixture(1)
    try {
      const second = await otherCustomer()
      const request = (customerId: string) => ({
        bookingKey: crypto.randomUUID(), customerId, ...RANGE, language: 'it',
        lines: [{ bikeModelId: solo.modelId, bikeSizeId: solo.sizeId, bikeVersionId: solo.versionId, amountCents: 2000 }],
      })
      const results = await Promise.all([startHold(request(solo.customerId)), startHold(request(second))])
      expect(results.map((r) => r.status).sort()).toEqual(['held', 'unavailable'])
    } finally {
      await solo.cleanup()
    }
  })

  it('lets a customer have one payment on its way at a time', async () => {
    const first = await startHold(input())
    if (first.status !== 'held') throw new Error('setup')
    expect(await startHold(input())).toEqual({ status: 'has_pending', bookingId: first.bookingId })
    expect(await findPendingBooking(fx.customerId)).toMatchObject({ id: first.bookingId, stripeSessionId: null })
    await expireBooking(first.bookingId)
    expect(await findPendingBooking(fx.customerId)).toBeNull()
    expect((await startHold(input())).status).toBe('held')
  })

  it('makes a customer who has let five bookings lapse in the last hour wait', async () => {
    for (let i = 0; i < 5; i++) await insertBooking(fx.customerId, RANGE, { status: 'expired', createdMinutesAgo: 10 + i })
    expect(await startHold(input())).toEqual({ status: 'too_many_attempts' })
    expect(await free()).toBe(3)
  })

  it('does not count lapsed bookings older than an hour, nor four of them', async () => {
    for (let i = 0; i < 4; i++) await insertBooking(fx.customerId, RANGE, { status: 'expired', createdMinutesAgo: 10 })
    await insertBooking(fx.customerId, RANGE, { status: 'expired', createdMinutesAgo: 90 })
    expect((await startHold(input())).status).toBe('held')
  })

  it('confirms a pending booking and its bikes, once', async () => {
    const result = await startHold(input({ lines: lines(2) }))
    if (result.status !== 'held') throw new Error('setup')
    expect(await confirmHold(result.bookingId)).toEqual({ confirmed: true, lines: 2 })
    expect((await linesOf(result.bookingId)).every((line) => line.status === 'confirmed')).toBe(true)
    const booking = await bookingOf(result.bookingId)
    expect(booking.status).toBe('confirmed')
    expect(booking.confirmedAt).not.toBeNull()
    expect(await confirmHold(result.bookingId)).toEqual({ confirmed: false, lines: 0 })
  })

  it('does not confirm a booking that has expired, and its bikes stay free', async () => {
    const result = await startHold(input())
    if (result.status !== 'held') throw new Error('setup')
    expect(await expireBooking(result.bookingId)).toEqual({ expired: true, lines: 1 })
    expect(await confirmHold(result.bookingId)).toEqual({ confirmed: false, lines: 0 })
    expect((await linesOf(result.bookingId)).every((line) => line.status === 'expired')).toBe(true)
    expect(await free()).toBe(3)
  })

  it('confirm and expire together: never a confirmed booking with expired bikes, nor the other way round', async () => {
    for (let round = 0; round < 8; round++) {
      const result = await startHold(input({ bookingKey: crypto.randomUUID(), lines: lines(2) }))
      if (result.status !== 'held') throw new Error('setup')
      await Promise.all([confirmHold(result.bookingId), expireBooking(result.bookingId)])
      const booking = await bookingOf(result.bookingId)
      const states = [...new Set((await linesOf(result.bookingId)).map((line) => line.status))]
      // Whichever statement won the booking decided for the bikes too: all of them agree with it.
      expect(['confirmed', 'expired']).toContain(booking.status)
      expect(states).toEqual([booking.status])
      // free the bikes for the next round
      await db.delete(bikeReservations).where(eq(bikeReservations.bookingId, result.bookingId))
      await db.delete(bookings).where(eq(bookings.id, result.bookingId))
    }
  })

  it('lists the pending bookings whose time has run out', async () => {
    const result = await startHold(input())
    if (result.status !== 'held') throw new Error('setup')
    expect(await findOverduePending()).not.toContainEqual(expect.objectContaining({ id: result.bookingId }))
    await db.update(bookings).set({ holdExpiresAt: sql`now() - interval '1 minute'` }).where(eq(bookings.id, result.bookingId))
    expect(await findOverduePending()).toContainEqual({ id: result.bookingId, stripeSessionId: null })
    await expireBooking(result.bookingId)
    expect(await findOverduePending()).not.toContainEqual(expect.objectContaining({ id: result.bookingId }))
  })

  // --- found by the final review ---------------------------------------------------------------------------

  it('does not hold a bike for a booking that has already been closed', async () => {
    const closed = await insertBooking(fx.customerId, RANGE, { status: 'expired', lineCount: 1 })
    const outcome = await holdOneBike(closed, input(), lines(1)[0])
    expect(outcome).toBe('closed')
    expect(await linesOf(closed)).toHaveLength(0)
    expect(await free()).toBe(3)
  })

  it('says a replay of a booking still being put together is in progress, not held', async () => {
    const key = crypto.randomUUID()
    const bookingId = await insertBooking(fx.customerId, RANGE, { lineCount: 2, requestKey: key })
    await insertOnlineLine(bookingId, fx.customerId, fx.unitIds[0], RANGE, 'held')
    expect(await startHold(input({ bookingKey: key, lines: lines(2) }))).toEqual({ status: 'in_progress', bookingId })
    await insertOnlineLine(bookingId, fx.customerId, fx.unitIds[1], RANGE, 'held')
    expect((await startHold(input({ bookingKey: key, lines: lines(2) }))).status).toBe('held')
  })

  it('does not confirm a booking that is missing some of its bikes', async () => {
    const bookingId = await insertBooking(fx.customerId, RANGE, { lineCount: 2 })
    await insertOnlineLine(bookingId, fx.customerId, fx.unitIds[0], RANGE, 'held')
    expect(await confirmHold(bookingId)).toEqual({ confirmed: false, lines: 0 })
    expect((await bookingOf(bookingId)).status).toBe('pending')
  })

  it('closes the booking and frees its bikes when something throws half way', async () => {
    const broken = { bikeModelId: 'not-a-uuid', bikeSizeId: fx.sizeId, bikeVersionId: fx.versionId, amountCents: 3000 }
    await expect(startHold(input({ lines: [...lines(1), broken] }))).rejects.toThrow()
    expect(await findPendingBooking(fx.customerId)).toBeNull()
    expect(await free()).toBe(3)
  })

  it('never lets one customer have two payments on their way, even from two tabs at once', async () => {
    for (let round = 0; round < 4; round++) {
      const results = await Promise.all([startHold(input()), startHold(input())])
      expect(results.map((r) => r.status).sort()).toEqual(['has_pending', 'held'])
      const pending = await db.select().from(bookings).where(eq(bookings.customerId, fx.customerId))
      expect(pending.filter((b) => b.status === 'pending')).toHaveLength(1)
      for (const b of pending) await expireBooking(b.id)
    }
  })

  it('does not answer a replay with the booking of another customer', async () => {
    const key = crypto.randomUUID()
    const first = await startHold(input({ bookingKey: key }))
    if (first.status !== 'held') throw new Error('setup')
    const stranger = await otherCustomer()
    const result = await startHold(input({ bookingKey: key, customerId: stranger }))
    expect(result.status).not.toBe('held')
    expect(result).not.toMatchObject({ bookingId: first.bookingId })
  })
})
