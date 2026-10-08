import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, bikeReservations, bookings } from '@/lib/db'
import { FakeGateway } from '@/lib/booking/payments/fake'
import { confirmBooking } from '@/lib/booking/confirm'
import { createFixture, insertBooking, startPendingBooking, type Fixture } from './fixtures'

const RANGE = { startsOn: '2031-11-03', endsOn: '2031-11-06' }

describe('confirmBooking', () => {
  let fx: Fixture
  let gateway: FakeGateway
  beforeEach(async () => { fx = await createFixture(3); gateway = new FakeGateway(new Map(), new Map()) })
  afterEach(async () => { await fx.cleanup() })

  const bookingOf = async (id: string) => (await db.select().from(bookings).where(eq(bookings.id, id)))[0]
  const linesOf = (id: string) => db.select().from(bikeReservations).where(eq(bikeReservations.bookingId, id))

  it('confirms the booking and its bikes once the session is paid, and keeps the payment reference', async () => {
    const pending = await startPendingBooking(fx, gateway, RANGE, 2)
    gateway.pay(pending.sessionId)
    expect(await confirmBooking(pending.bookingId, gateway)).toEqual({ status: 'confirmed', bookingId: pending.bookingId })
    const booking = await bookingOf(pending.bookingId)
    expect(booking).toMatchObject({ status: 'confirmed', stripePaymentIntentId: `fake_pi_${pending.sessionId}` })
    expect((await linesOf(pending.bookingId)).every((line) => line.status === 'confirmed')).toBe(true)
  })

  it('does nothing while the session is not paid', async () => {
    const pending = await startPendingBooking(fx, gateway, RANGE, 1)
    expect(await confirmBooking(pending.bookingId, gateway)).toEqual({ status: 'not_paid', bookingId: pending.bookingId })
    expect((await bookingOf(pending.bookingId)).status).toBe('pending')
  })

  it('is safe to call again: the second call finds it already confirmed', async () => {
    const pending = await startPendingBooking(fx, gateway, RANGE, 1)
    gateway.pay(pending.sessionId)
    await confirmBooking(pending.bookingId, gateway)
    expect(await confirmBooking(pending.bookingId, gateway)).toEqual({ status: 'already_confirmed', bookingId: pending.bookingId })
  })

  it('called twice at the same time (the webhook and the page the customer lands on): one confirmation, nothing broken', async () => {
    const pending = await startPendingBooking(fx, gateway, RANGE, 2)
    gateway.pay(pending.sessionId)
    const results = await Promise.all([confirmBooking(pending.bookingId, gateway), confirmBooking(pending.bookingId, gateway)])
    expect(results.map((r) => r.status).sort()).toEqual(['already_confirmed', 'confirmed'])
    expect((await bookingOf(pending.bookingId)).status).toBe('confirmed')
    expect((await linesOf(pending.bookingId)).every((line) => line.status === 'confirmed')).toBe(true)
  })

  it('knows nothing of a booking that does not exist, and of one with no session yet', async () => {
    expect(await confirmBooking(crypto.randomUUID(), gateway)).toEqual({ status: 'unknown_booking' })
    const bare = await insertBooking(fx.customerId, RANGE) // pending, no session
    expect(await confirmBooking(bare, gateway)).toEqual({ status: 'not_paid', bookingId: bare })
  })

  it('leaves a booking alone that is already closed for another reason (cancelled, refunded)', async () => {
    const pending = await startPendingBooking(fx, gateway, RANGE, 1)
    gateway.pay(pending.sessionId)
    await db.update(bookings).set({ status: 'cancelled' }).where(eq(bookings.id, pending.bookingId))
    expect(await confirmBooking(pending.bookingId, gateway)).toEqual({ status: 'closed', bookingId: pending.bookingId, bookingStatus: 'cancelled' })
  })

  it('does not confirm a pending booking that is missing some of its bikes', async () => {
    const pending = await startPendingBooking(fx, gateway, RANGE, 2)
    gateway.pay(pending.sessionId)
    await db.update(bikeReservations).set({ status: 'expired' }).where(eq(bikeReservations.bookingId, pending.bookingId))
    // booking still pending, all its bikes gone: a payment cannot confirm bikes that are not held
    expect(await confirmBooking(pending.bookingId, gateway)).toEqual({ status: 'incomplete', bookingId: pending.bookingId })
    expect((await bookingOf(pending.bookingId)).status).toBe('pending')
  })
})
