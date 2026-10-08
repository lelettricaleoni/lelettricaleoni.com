import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, bikeReservations, bookingRefunds, bookings, customers } from '@/lib/db'
import { FakeGateway } from '@/lib/booking/payments/fake'
import { getFreeBikes } from '@/lib/booking/availability'
import { cancelOnlineReservation, issueRefund, type CancelActor } from '@/lib/booking/refunds'
import { createFixture, insertPaidBooking, type Fixture } from './fixtures'

const FAR = { startsOn: '2031-12-10', endsOn: '2031-12-13' }
const NOW_EARLY = new Date('2031-12-01T10:00:00Z')

describe('refunds and the cancellation of one online bike', () => {
  let fx: Fixture
  let gateway: FakeGateway
  const strangers: string[] = []
  beforeEach(async () => { fx = await createFixture(3); gateway = new FakeGateway(new Map(), new Map()) })
  afterEach(async () => {
    await fx.cleanup()
    for (const id of strangers.splice(0)) await db.delete(customers).where(eq(customers.id, id))
  })

  const customer = (): CancelActor => ({ kind: 'customer', customerId: fx.customerId, userId: crypto.randomUUID() })
  const staff = (): CancelActor => ({ kind: 'staff', userId: crypto.randomUUID() })
  const stateOf = async (reservationId: string) =>
    (await db.select().from(bikeReservations).where(eq(bikeReservations.id, reservationId)))[0].status
  const bookingStatus = async (id: string) => (await db.select().from(bookings).where(eq(bookings.id, id)))[0].status
  const refundsOf = (bookingId: string) => db.select().from(bookingRefunds).where(eq(bookingRefunds.bookingId, bookingId))

  describe('the customer', () => {
    it('cancels one bike of two and gets that bike back, in full; the other stays', async () => {
      const paid = await insertPaidBooking(fx, FAR, [3000, 4000])
      const result = await cancelOnlineReservation({ reservationId: paid.reservationIds[0], actor: customer(), now: NOW_EARLY }, gateway)
      expect(result).toEqual({ status: 'cancelled', refundedCents: 3000, bookingCancelled: false, refund: 'succeeded' })
      expect(await stateOf(paid.reservationIds[0])).toBe('cancelled')
      expect(await stateOf(paid.reservationIds[1])).toBe('confirmed')
      expect(await bookingStatus(paid.bookingId)).toBe('confirmed')
      expect(await refundsOf(paid.bookingId)).toMatchObject([
        { amountCents: 3000, status: 'succeeded', reason: 'customer', gatewayRefundId: expect.stringMatching(/^fake_re_/) },
      ])
    })

    it('cancels the last bike and the booking is cancelled with it', async () => {
      const paid = await insertPaidBooking(fx, FAR, [3000, 4000])
      await cancelOnlineReservation({ reservationId: paid.reservationIds[0], actor: customer(), now: NOW_EARLY }, gateway)
      const last = await cancelOnlineReservation({ reservationId: paid.reservationIds[1], actor: customer(), now: NOW_EARLY }, gateway)
      expect(last).toMatchObject({ status: 'cancelled', bookingCancelled: true })
      expect(await bookingStatus(paid.bookingId)).toBe('cancelled')
    })

    it('frees the dates of the bike that was cancelled, and not the others', async () => {
      const paid = await insertPaidBooking(fx, FAR, [3000, 4000])
      await cancelOnlineReservation({ reservationId: paid.reservationIds[0], actor: customer(), now: NOW_EARLY }, gateway)
      const mine = (await getFreeBikes(FAR, { publishedOnly: false })).find((row) => row.bikeModelId === fx.modelId)
      expect(mine?.free).toBe(2) // 3 bikes, 1 still confirmed
    })

    it('cannot cancel after the deadline (09:00 in Rome, two days before): nothing is refunded', async () => {
      const paid = await insertPaidBooking(fx, FAR, [3000])
      const result = await cancelOnlineReservation({ reservationId: paid.reservationIds[0], actor: customer(), now: new Date('2031-12-08T08:00:01Z') }, gateway)
      expect(result).toMatchObject({ status: 'too_late' })
      expect(await stateOf(paid.reservationIds[0])).toBe('confirmed')
      expect(gateway.refundCount()).toBe(0)
    })

    it('cannot cancel the bike of somebody else: it does not even exist for them', async () => {
      const paid = await insertPaidBooking(fx, FAR, [3000])
      const [stranger] = await db.insert(customers).values({ firstName: 'db-test', lastName: `other-${crypto.randomUUID()}` }).returning()
      strangers.push(stranger.id)
      const result = await cancelOnlineReservation({
        reservationId: paid.reservationIds[0], actor: { kind: 'customer', customerId: stranger.id, userId: crypto.randomUUID() }, now: NOW_EARLY,
      }, gateway)
      expect(result).toEqual({ status: 'not_found' })
      expect(await stateOf(paid.reservationIds[0])).toBe('confirmed')
      expect(gateway.refundCount()).toBe(0)
    })

    it('cannot cancel what is not an online bike, or does not exist', async () => {
      expect(await cancelOnlineReservation({ reservationId: crypto.randomUUID(), actor: customer(), now: NOW_EARLY }, gateway)).toEqual({ status: 'not_found' })
    })

    it('says so when the bike was already cancelled', async () => {
      const paid = await insertPaidBooking(fx, FAR, [3000])
      await cancelOnlineReservation({ reservationId: paid.reservationIds[0], actor: customer(), now: NOW_EARLY }, gateway)
      expect(await cancelOnlineReservation({ reservationId: paid.reservationIds[0], actor: customer(), now: NOW_EARLY }, gateway))
        .toEqual({ status: 'already_cancelled' })
    })

    it('two cancellations at once of the same bike: one refund, one cancellation', async () => {
      const paid = await insertPaidBooking(fx, FAR, [3000, 4000])
      const ask = () => cancelOnlineReservation({ reservationId: paid.reservationIds[0], actor: customer(), now: NOW_EARLY }, gateway)
      const results = await Promise.all([ask(), ask()])
      expect(results.map((r) => r.status).sort()).toEqual(['already_cancelled', 'cancelled'])
      expect(await refundsOf(paid.bookingId)).toHaveLength(1)
      expect(gateway.refundCount()).toBe(1)
    })

    it('asks the gateway again as a NEW attempt after a failure, never with the key that already failed', async () => {
      const paid = await insertPaidBooking(fx, FAR, [3000])
      const attempts: number[] = []
      const real = gateway.refund.bind(gateway)
      gateway.refund = async (request) => { attempts.push(request.attempt); return real(request) }
      gateway.failNextRefund = true
      await cancelOnlineReservation({ reservationId: paid.reservationIds[0], actor: customer(), now: NOW_EARLY }, gateway)
      await cancelOnlineReservation({ reservationId: paid.reservationIds[0], actor: customer(), now: NOW_EARLY }, gateway)
      expect(attempts).toEqual([1, 2])
      expect(await refundsOf(paid.bookingId)).toMatchObject([{ status: 'succeeded', attempts: 2 }])
    })

    it('finishes the cancellation of a bike whose refund was already made, even after the deadline: the money is back, the bike must go', async () => {
      const paid = await insertPaidBooking(fx, FAR, [3000])
      // the gateway refunded, then the database failed before the bike was cancelled
      await db.insert(bookingRefunds).values({
        reservationId: paid.reservationIds[0], bookingId: paid.bookingId, amountCents: 3000, reason: 'customer',
        status: 'succeeded', gatewayRefundId: 'fake_re_done_1',
      })
      const result = await cancelOnlineReservation({ reservationId: paid.reservationIds[0], actor: customer(), now: new Date('2031-12-09T10:00:00Z') }, gateway)
      expect(result).toEqual({ status: 'cancelled', refundedCents: 3000, bookingCancelled: true, refund: 'succeeded' })
      expect(await stateOf(paid.reservationIds[0])).toBe('cancelled')
      expect(gateway.refundCount()).toBe(0)
    })

    it('keeps the bike and says why when the gateway refuses; asking again finishes the job', async () => {
      const paid = await insertPaidBooking(fx, FAR, [3000])
      gateway.failNextRefund = true
      const refused = await cancelOnlineReservation({ reservationId: paid.reservationIds[0], actor: customer(), now: NOW_EARLY }, gateway)
      expect(refused).toMatchObject({ status: 'refund_failed' })
      expect(await stateOf(paid.reservationIds[0])).toBe('confirmed')
      expect(await refundsOf(paid.bookingId)).toMatchObject([{ status: 'failed' }])
      const retried = await cancelOnlineReservation({ reservationId: paid.reservationIds[0], actor: customer(), now: NOW_EARLY }, gateway)
      expect(retried).toMatchObject({ status: 'cancelled', refund: 'succeeded' })
      expect(await refundsOf(paid.bookingId)).toMatchObject([{ status: 'succeeded' }])
    })
  })

  describe('the staff', () => {
    it('cancels with a partial refund, at any time, and the refund is theirs', async () => {
      const paid = await insertPaidBooking(fx, FAR, [4000])
      const actor = staff()
      const result = await cancelOnlineReservation({ reservationId: paid.reservationIds[0], actor, refundCents: 1500, now: new Date('2031-12-12T10:00:00Z') }, gateway)
      expect(result).toEqual({ status: 'cancelled', refundedCents: 1500, bookingCancelled: true, refund: 'succeeded' })
      expect(await refundsOf(paid.bookingId)).toMatchObject([{ amountCents: 1500, reason: 'staff', createdBy: actor.userId }])
    })

    it('cancels with no refund at all: no refund row, no call to the gateway', async () => {
      const paid = await insertPaidBooking(fx, FAR, [4000])
      const result = await cancelOnlineReservation({ reservationId: paid.reservationIds[0], actor: staff(), refundCents: 0, now: NOW_EARLY }, gateway)
      expect(result).toEqual({ status: 'cancelled', refundedCents: 0, bookingCancelled: true, refund: 'none' })
      expect(await refundsOf(paid.bookingId)).toHaveLength(0)
      expect(gateway.refundCount()).toBe(0)
    })

    it('refunds everything by default, and refuses an amount that is more than the bike or not whole cents', async () => {
      const paid = await insertPaidBooking(fx, FAR, [4000, 2000])
      expect(await cancelOnlineReservation({ reservationId: paid.reservationIds[0], actor: staff(), refundCents: 4001, now: NOW_EARLY }, gateway)).toEqual({ status: 'invalid_amount' })
      expect(await cancelOnlineReservation({ reservationId: paid.reservationIds[0], actor: staff(), refundCents: 10.5, now: NOW_EARLY }, gateway)).toEqual({ status: 'invalid_amount' })
      expect(await cancelOnlineReservation({ reservationId: paid.reservationIds[0], actor: staff(), refundCents: -1, now: NOW_EARLY }, gateway)).toEqual({ status: 'invalid_amount' })
      expect(await stateOf(paid.reservationIds[0])).toBe('confirmed')
      const all = await cancelOnlineReservation({ reservationId: paid.reservationIds[0], actor: staff(), now: NOW_EARLY }, gateway)
      expect(all).toMatchObject({ status: 'cancelled', refundedCents: 4000 })
    })
  })

  describe('issueRefund', () => {
    it('never refunds more than the booking was paid, whatever is asked bike by bike', async () => {
      const paid = await insertPaidBooking(fx, FAR, [3000, 4000])
      // the booking was paid less than its bikes add up to (a discount given by hand): the cap is the booking's own total
      await db.update(bookings).set({ totalCents: 5000 }).where(eq(bookings.id, paid.bookingId))
      const base = { bookingId: paid.bookingId, paymentRef: paid.paymentRef, reason: 'staff' as const, createdBy: null }
      expect(await issueRefund({ ...base, reservationId: paid.reservationIds[0], amountCents: 3000 }, gateway)).toMatchObject({ status: 'succeeded' })
      expect(await issueRefund({ ...base, reservationId: paid.reservationIds[1], amountCents: 2001 }, gateway)).toEqual({ status: 'failed', reason: 'over_total' })
      expect(await issueRefund({ ...base, reservationId: paid.reservationIds[1], amountCents: 2000 }, gateway)).toMatchObject({ status: 'succeeded' })
      expect(gateway.refundCount()).toBe(2)
    })

    it('never refunds more than the bike itself cost, even when the rest of the booking could cover it', async () => {
      const paid = await insertPaidBooking(fx, FAR, [3000, 4000])
      const result = await issueRefund({
        bookingId: paid.bookingId, paymentRef: paid.paymentRef, reservationId: paid.reservationIds[0],
        amountCents: 3500, reason: 'staff', createdBy: null,
      }, gateway)
      expect(result).toEqual({ status: 'failed', reason: 'not_refundable' })
      expect(gateway.refundCount()).toBe(0)
      expect(await refundsOf(paid.bookingId)).toHaveLength(0)
    })

    it('does not refund a bike that was already cancelled (a cancellation that won the race): no money moves', async () => {
      const paid = await insertPaidBooking(fx, FAR, [3000, 4000])
      // staff cancel with nothing to give back: no refund row exists, the bike is cancelled
      await cancelOnlineReservation({ reservationId: paid.reservationIds[0], actor: staff(), refundCents: 0, now: NOW_EARLY }, gateway)
      const result = await issueRefund({
        bookingId: paid.bookingId, paymentRef: paid.paymentRef, reservationId: paid.reservationIds[0],
        amountCents: 3000, reason: 'customer', createdBy: null,
      }, gateway)
      expect(result).toEqual({ status: 'failed', reason: 'not_refundable' })
      expect(gateway.refundCount()).toBe(0)
    })

    it('a refund that already succeeded is not asked for again', async () => {
      const paid = await insertPaidBooking(fx, FAR, [3000])
      const request = {
        bookingId: paid.bookingId, paymentRef: paid.paymentRef, reservationId: paid.reservationIds[0],
        amountCents: 3000, reason: 'customer' as const, createdBy: null,
      }
      const first = await issueRefund(request, gateway)
      const second = await issueRefund(request, gateway)
      expect(second).toEqual(first)
      expect(await refundsOf(paid.bookingId)).toHaveLength(1)
    })
  })
})
