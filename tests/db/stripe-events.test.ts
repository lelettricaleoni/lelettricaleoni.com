import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import type Stripe from 'stripe'
import { db, bookingRefunds, bookings, stripeEvents } from '@/lib/db'
import { FakeGateway } from '@/lib/booking/payments/fake'
import { getFreeBikes } from '@/lib/booking/availability'
import { processStripeEvent } from '@/lib/booking/stripe-events'
import { createFixture, insertPaidBooking, startPendingBooking, type Fixture } from './fixtures'

const RANGE = { startsOn: '2031-12-10', endsOn: '2031-12-13' }

describe('what the webhook does with a genuine event', () => {
  let fx: Fixture
  let gateway: FakeGateway
  const eventIds: string[] = []
  beforeEach(async () => { fx = await createFixture(3); gateway = new FakeGateway(new Map(), new Map()) })
  afterEach(async () => {
    await fx.cleanup()
    if (eventIds.length) await db.delete(stripeEvents).where(inArray(stripeEvents.id, eventIds.splice(0)))
    vi.restoreAllMocks()
  })

  const event = (type: string, object: object, id = `evt_test_${crypto.randomUUID()}`): Stripe.Event => {
    eventIds.push(id)
    return { id, type, data: { object } } as unknown as Stripe.Event
  }
  const bookingOf = async (id: string) => (await db.select().from(bookings).where(eq(bookings.id, id)))[0]
  const free = async () => (await getFreeBikes(RANGE, { publishedOnly: false })).find((r) => r.bikeModelId === fx.modelId)?.free ?? 0

  describe('a payment completed', () => {
    it('confirms the booking once Stripe says the session is paid, and says which booking, for the shop\'s calendar', async () => {
      const pending = await startPendingBooking(fx, gateway, RANGE, 2)
      gateway.pay(pending.sessionId)
      const result = await processStripeEvent(event('checkout.session.completed', { id: pending.sessionId }), gateway)
      expect(result).toEqual({ status: 'handled', confirmedBookingId: pending.bookingId })
      expect((await bookingOf(pending.bookingId)).status).toBe('confirmed')
    })

    it('does not confirm on the word of the event: a session that Stripe does not report as paid stays as it is', async () => {
      const pending = await startPendingBooking(fx, gateway, RANGE, 1)
      const result = await processStripeEvent(event('checkout.session.completed', { id: pending.sessionId }), gateway)
      expect(result).toEqual({ status: 'handled' })
      expect((await bookingOf(pending.bookingId)).status).toBe('pending')
    })

    it('does the work once: the same event again is a duplicate and touches nothing', async () => {
      const pending = await startPendingBooking(fx, gateway, RANGE, 1)
      gateway.pay(pending.sessionId)
      const same = event('checkout.session.completed', { id: pending.sessionId })
      expect((await processStripeEvent(same, gateway)).status).toBe('handled')
      const getSession = vi.spyOn(gateway, 'getSession')
      expect(await processStripeEvent(same, gateway)).toEqual({ status: 'duplicate' })
      expect(getSession).not.toHaveBeenCalled()
    })

    it('does the work again for an event that was written down but never finished (the process stopped half way)', async () => {
      const pending = await startPendingBooking(fx, gateway, RANGE, 1)
      gateway.pay(pending.sessionId)
      const half = event('checkout.session.completed', { id: pending.sessionId })
      await db.insert(stripeEvents).values({ id: half.id, type: half.type })
      expect((await processStripeEvent(half, gateway)).status).toBe('handled')
      expect((await bookingOf(pending.bookingId)).status).toBe('confirmed')
      const [row] = await db.select().from(stripeEvents).where(eq(stripeEvents.id, half.id))
      expect(row.processedAt).not.toBeNull()
    })

    it('answers (and writes down) an event about a session of nobody we know, instead of failing for ever', async () => {
      const result = await processStripeEvent(event('checkout.session.completed', { id: 'cs_unknown' }), gateway)
      expect(result).toEqual({ status: 'handled' })
    })
  })

  describe('a session that ran out', () => {
    it('frees the bikes through the same check as the timer (the session is closed first)', async () => {
      const pending = await startPendingBooking(fx, gateway, RANGE, 2)
      expect(await free()).toBe(1)
      await processStripeEvent(event('checkout.session.expired', { id: pending.sessionId }), gateway)
      expect((await bookingOf(pending.bookingId)).status).toBe('expired')
      expect(await free()).toBe(3)
    })

    it('does not free a booking that was paid at the very end: it is confirmed', async () => {
      const pending = await startPendingBooking(fx, gateway, RANGE, 1)
      gateway.pay(pending.sessionId)
      await processStripeEvent(event('checkout.session.expired', { id: pending.sessionId }), gateway)
      expect((await bookingOf(pending.bookingId)).status).toBe('confirmed')
    })
  })

  describe('a refund', () => {
    const refundRow = async (status: 'pending' | 'succeeded' | 'failed', over: { gatewayRefundId?: string | null; attempts?: number } = {}) => {
      const paid = await insertPaidBooking(fx, RANGE, [3000])
      await db.insert(bookingRefunds).values({
        reservationId: paid.reservationIds[0], bookingId: paid.bookingId, amountCents: 3000, status, reason: 'customer',
        gatewayRefundId: over.gatewayRefundId === undefined ? 're_1' : over.gatewayRefundId, attempts: over.attempts ?? 1,
      })
      return paid
    }
    const rowOf = async (reservationId: string) => (await db.select().from(bookingRefunds).where(eq(bookingRefunds.reservationId, reservationId)))[0]
    const refund = (over: object) => ({ id: 're_1', status: 'succeeded', metadata: {}, ...over })

    it('turns a pending refund into a done one when Stripe says it went through', async () => {
      const paid = await refundRow('pending')
      await processStripeEvent(event('refund.updated', refund({})), gateway)
      expect((await rowOf(paid.reservationIds[0])).status).toBe('succeeded')
    })

    it('finds the row by the reservation in the metadata when our own answer was not written yet', async () => {
      const paid = await refundRow('pending', { gatewayRefundId: null })
      await processStripeEvent(event('refund.created', refund({ metadata: { reservation_id: paid.reservationIds[0], attempt: '1' } })), gateway)
      expect(await rowOf(paid.reservationIds[0])).toMatchObject({ status: 'succeeded', gatewayRefundId: 're_1' })
    })

    it('marks a refund that failed at Stripe as failed, so it can be asked again', async () => {
      const paid = await refundRow('pending')
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      await processStripeEvent(event('refund.failed', refund({ status: 'failed', failure_reason: 'lost_or_stolen_card', metadata: { attempt: '1' } })), gateway)
      expect((await rowOf(paid.reservationIds[0])).status).toBe('failed')
    })

    it('leaves the log with ids and the reason only, nothing about the person', async () => {
      const paid = await refundRow('pending')
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      await processStripeEvent(event('refund.failed', refund({ status: 'failed', failure_reason: 'lost_or_stolen_card', metadata: { attempt: '1' } })), gateway)
      expect(error).toHaveBeenCalledWith(expect.any(String), { bookingId: paid.bookingId, reservationId: paid.reservationIds[0], reason: 'lost_or_stolen_card' })
    })

    it('ignores the failure of an older attempt: the newer request is what counts', async () => {
      const paid = await refundRow('pending', { attempts: 2 })
      await processStripeEvent(event('refund.failed', refund({ status: 'failed', metadata: { attempt: '1' } })), gateway)
      expect((await rowOf(paid.reservationIds[0])).status).toBe('pending')
    })

    it('never turns a refund that went through back into a failure', async () => {
      const paid = await refundRow('succeeded')
      await processStripeEvent(event('refund.failed', refund({ status: 'failed', metadata: { attempt: '1' } })), gateway)
      expect((await rowOf(paid.reservationIds[0])).status).toBe('succeeded')
    })

    it('leaves alone a refund made by hand in the Stripe dashboard (no row, no bike to put right), and still answers', async () => {
      const result = await processStripeEvent(event('refund.created', refund({ id: 're_by_hand' })), gateway)
      expect(result).toEqual({ status: 'handled' })
    })
  })

  it('answers the events it has no use for, and writes them down', async () => {
    const other = event('customer.created', { id: 'cus_1' })
    expect(await processStripeEvent(other, gateway)).toEqual({ status: 'ignored' })
    expect((await db.select().from(stripeEvents).where(eq(stripeEvents.id, other.id)))[0].processedAt).not.toBeNull()
  })
})
