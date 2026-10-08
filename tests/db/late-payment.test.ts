import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, bikeReservations, bookingRefunds, bookings } from '@/lib/db'
import { FakeGateway } from '@/lib/booking/payments/fake'
import { confirmBooking } from '@/lib/booking/confirm'
import { expireBooking } from '@/lib/booking/holds'
import { createFixture, insertPaidBooking, startPendingBooking, type Fixture } from './fixtures'

const RANGE = { startsOn: '2031-11-03', endsOn: '2031-11-06' }

/** A booking whose bikes were freed (`expired`) although its session was then paid: the case that should never happen. */
describe('a payment that arrives after the bikes were freed', () => {
  let fx: Fixture
  let gateway: FakeGateway
  beforeEach(async () => { fx = await createFixture(2); gateway = new FakeGateway(new Map(), new Map()) })
  afterEach(async () => { await fx.cleanup() })

  const bookingOf = async (id: string) => (await db.select().from(bookings).where(eq(bookings.id, id)))[0]
  const linesOf = (id: string) => db.select().from(bikeReservations).where(eq(bikeReservations.bookingId, id))
  const refundsOf = (id: string) => db.select().from(bookingRefunds).where(eq(bookingRefunds.bookingId, id))

  async function paidButExpired(lineCount: number) {
    const pending = await startPendingBooking(fx, gateway, RANGE, lineCount)
    gateway.pay(pending.sessionId) // the money arrived...
    await expireBooking(pending.bookingId) // ...but the bikes had been given up
    return pending
  }

  it('gives the bikes back when they are still free: the booking is confirmed with bikes held again', async () => {
    const pending = await paidButExpired(2)
    const result = await confirmBooking(pending.bookingId, gateway)
    expect(result).toEqual({ status: 'reassigned', bookingId: pending.bookingId })
    expect((await bookingOf(pending.bookingId)).status).toBe('confirmed')
    const confirmed = (await linesOf(pending.bookingId)).filter((line) => line.status === 'confirmed')
    expect(confirmed).toHaveLength(2)
    expect(new Set(confirmed.map((line) => line.bikeUnitId)).size).toBe(2)
    expect(gateway.refundCount()).toBe(0)
  })

  it('refunds everything and marks the booking failed_refunded when the bikes were taken meanwhile', async () => {
    const pending = await paidButExpired(2)
    const thief = await insertPaidBooking(fx, RANGE, [1000, 1000]) // somebody else took both bikes in the meantime
    expect(thief.reservationIds).toHaveLength(2)
    const result = await confirmBooking(pending.bookingId, gateway)
    expect(result).toEqual({ status: 'refunded', bookingId: pending.bookingId })
    expect((await bookingOf(pending.bookingId)).status).toBe('failed_refunded')
    const refunds = await refundsOf(pending.bookingId)
    expect(refunds).toHaveLength(2)
    expect(refunds.every((refund) => refund.reason === 'late_payment' && refund.status === 'succeeded' && refund.createdBy === null)).toBe(true)
    expect(refunds.reduce((sum, refund) => sum + refund.amountCents, 0)).toBe(6000)
    // nothing of the failed attempt keeps the bikes blocked
    expect((await linesOf(pending.bookingId)).every((line) => line.status === 'expired')).toBe(true)
  })

  it('asks again and finishes when a refund failed: it never sells the bikes after it started giving the money back', async () => {
    const pending = await paidButExpired(2)
    const thief = await insertPaidBooking(fx, RANGE, [1000, 1000])
    gateway.failNextRefund = true
    const first = await confirmBooking(pending.bookingId, gateway)
    expect(first).toEqual({ status: 'refund_failed', bookingId: pending.bookingId })
    // the booking is already claimed for the refund: nobody can sell its bikes again while the money is on its way back
    expect((await bookingOf(pending.bookingId)).status).toBe('failed_refunded')
    // the thief's bikes are cancelled meanwhile: the bikes are free again, but the money is already on its way back
    await db.update(bikeReservations).set({ status: 'cancelled' }).where(eq(bikeReservations.bookingId, thief.bookingId))
    const second = await confirmBooking(pending.bookingId, gateway)
    expect(second).toEqual({ status: 'refunded', bookingId: pending.bookingId })
    expect((await bookingOf(pending.bookingId)).status).toBe('failed_refunded')
    expect(gateway.refundCount()).toBe(2)
  })

  it('two calls at once (the webhook and the page the customer lands on): the bikes are given back OR the money is, never both', async () => {
    for (let round = 0; round < 5; round++) {
      const pending = await paidButExpired(2)
      const results = await Promise.all([confirmBooking(pending.bookingId, gateway), confirmBooking(pending.bookingId, gateway)])
      const booking = await bookingOf(pending.bookingId)
      expect(booking.status).toBe('confirmed')
      expect(results.map((r) => r.status)).not.toContain('refunded')
      expect(results.map((r) => r.status)).toContain('reassigned')
      expect(await refundsOf(pending.bookingId)).toHaveLength(0)
      expect(gateway.refundCount()).toBe(0)
      // free the bikes for the next round
      await db.delete(bikeReservations).where(eq(bikeReservations.bookingId, pending.bookingId))
      await db.delete(bookings).where(eq(bookings.id, pending.bookingId))
    }
  })

  it('finishes the refunds after a bring-back attempt that held some bikes and failed on the next', async () => {
    const pending = await paidButExpired(2)
    await insertPaidBooking(fx, RANGE, [1000]) // takes one of the two bikes: the first line finds a bike, the second does not
    gateway.failNextRefund = true
    const first = await confirmBooking(pending.bookingId, gateway)
    expect(first).toEqual({ status: 'refund_failed', bookingId: pending.bookingId })
    const second = await confirmBooking(pending.bookingId, gateway)
    expect(second).toEqual({ status: 'refunded', bookingId: pending.bookingId })
    const refunds = await refundsOf(pending.bookingId)
    expect(refunds).toHaveLength(2) // one per ORIGINAL bike, not one more for the bike held again for a moment
    expect(refunds.reduce((sum, refund) => sum + refund.amountCents, 0)).toBe(6000)
    expect(gateway.refundCount()).toBe(2)
  })

  it('refunds when the customer already has another payment on its way (one at a time)', async () => {
    const pending = await paidButExpired(1)
    await startPendingBooking(fx, gateway, { startsOn: '2032-01-10', endsOn: '2032-01-12' }, 1) // another pending booking
    const result = await confirmBooking(pending.bookingId, gateway)
    expect(result).toEqual({ status: 'refunded', bookingId: pending.bookingId })
    expect(gateway.refundCount()).toBe(1)
  })
})
