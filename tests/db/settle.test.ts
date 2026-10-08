import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { db, bikeReservations, bookings } from '@/lib/db'
import { FakeGateway } from '@/lib/booking/payments/fake'
import { settleHold, settleOverdueHolds } from '@/lib/booking/settle'
import { getFreeBikes } from '@/lib/booking/availability'
import { createFixture, insertBooking, startPendingBooking, type Fixture } from './fixtures'

// A hook that runs once, right before expireBooking, to make something happen at the exact moment a real race would.
const hooks = vi.hoisted(() => ({ beforeExpire: undefined as undefined | ((bookingId: string) => Promise<void>) }))
vi.mock('@/lib/booking/holds', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/booking/holds')>()
  return {
    ...real,
    expireBooking: async (bookingId: string) => {
      const hook = hooks.beforeExpire
      hooks.beforeExpire = undefined
      if (hook) await hook(bookingId)
      return real.expireBooking(bookingId)
    },
  }
})

const RANGE = { startsOn: '2031-11-03', endsOn: '2031-11-06' }

describe('settling a held booking', () => {
  let fx: Fixture
  let gateway: FakeGateway
  beforeEach(async () => { fx = await createFixture(3); gateway = new FakeGateway(new Map(), new Map()) })
  afterEach(async () => { await fx.cleanup() })

  const bookingOf = async (id: string) => (await db.select().from(bookings).where(eq(bookings.id, id)))[0]
  const free = async () => (await getFreeBikes(RANGE, { publishedOnly: false })).find((r) => r.bikeModelId === fx.modelId)?.free ?? 0
  const makeOverdue = (id: string) =>
    db.update(bookings).set({ holdExpiresAt: sql`now() - interval '1 minute'` }).where(eq(bookings.id, id))

  it('closes the session first, and only then frees the bikes', async () => {
    const pending = await startPendingBooking(fx, gateway, RANGE, 2)
    expect(await free()).toBe(1)
    expect(await settleHold(pending.bookingId, gateway)).toBe('expired')
    expect(await gateway.getSession(pending.sessionId)).toEqual({ status: 'expired' })
    expect((await bookingOf(pending.bookingId)).status).toBe('expired')
    expect(await free()).toBe(3)
  })

  it('if the customer paid in the meantime, it confirms instead of freeing: a paid bike is never given to somebody else', async () => {
    const pending = await startPendingBooking(fx, gateway, RANGE, 2)
    gateway.pay(pending.sessionId)
    expect(await settleHold(pending.bookingId, gateway)).toBe('confirmed')
    expect((await bookingOf(pending.bookingId)).status).toBe('confirmed')
    expect(await free()).toBe(1)
  })

  it('frees the bikes of a session that had already expired by itself', async () => {
    const pending = await startPendingBooking(fx, gateway, RANGE, 1)
    await gateway.expireSession(pending.sessionId)
    expect(await settleHold(pending.bookingId, gateway)).toBe('expired')
    expect(await free()).toBe(3)
  })

  it('frees a booking that never got a session (the process died between the hold and the session)', async () => {
    const bare = await insertBooking(fx.customerId, RANGE) // pending, no session id
    expect(await settleHold(bare, gateway)).toBe('expired')
    expect((await bookingOf(bare)).status).toBe('expired')
  })

  it('a session that was saved while the hold was being settled is closed too: it never stays payable for a booking that is gone', async () => {
    const bare = await insertBooking(fx.customerId, RANGE) // pending, no session id when it is read
    const session = await gateway.createSession({
      bookingId: bare, bookingKey: crypto.randomUUID(), customerEmail: 'db-test@example.test', language: 'it',
      lines: [{ label: 'bike', amountCents: 3000 }], expiresAt: new Date(Date.now() + 30 * 60_000),
      successUrl: 'https://example.test/ok', cancelUrl: 'https://example.test/back',
    })
    // the customer's request saves the session id exactly between the moment settleHold read the booking and the moment it closes it
    hooks.beforeExpire = async (id) => { await db.update(bookings).set({ stripeSessionId: session.id }).where(eq(bookings.id, id)) }
    expect(await settleHold(bare, gateway)).toBe('expired')
    expect((await bookingOf(bare)).status).toBe('expired')
    expect(await gateway.getSession(session.id)).toEqual({ status: 'expired' })
  })

  it('a paid booking left pending with fewer bikes than it needs is not stuck for ever: the bikes come back or the money does', async () => {
    const pending = await startPendingBooking(fx, gateway, RANGE, 2)
    gateway.pay(pending.sessionId)
    // a bring-back attempt that died half way: the booking is pending again, paid, and holds only one of its two bikes
    const [firstLine] = await db.select().from(bikeReservations).where(eq(bikeReservations.bookingId, pending.bookingId))
    await db.update(bikeReservations).set({ status: 'expired' }).where(eq(bikeReservations.id, firstLine.id))
    expect(await settleHold(pending.bookingId, gateway)).toBe('confirmed')
    expect((await bookingOf(pending.bookingId)).status).toBe('confirmed')
    const confirmed = (await db.select().from(bikeReservations).where(eq(bikeReservations.bookingId, pending.bookingId))).filter((l) => l.status === 'confirmed')
    expect(confirmed).toHaveLength(2)
    expect(gateway.refundCount()).toBe(0)
  })

  it('does nothing to a booking that is not pending any more, or that does not exist', async () => {
    const pending = await startPendingBooking(fx, gateway, RANGE, 1)
    gateway.pay(pending.sessionId)
    await settleHold(pending.bookingId, gateway)
    expect(await settleHold(pending.bookingId, gateway)).toBe('closed')
    expect(await settleHold(crypto.randomUUID(), gateway)).toBe('closed')
  })

  it('payment and settlement at the same time: the bikes end up confirmed or freed, never both, never half', async () => {
    for (let round = 0; round < 6; round++) {
      const pending = await startPendingBooking(fx, gateway, RANGE, 2)
      const [, result] = await Promise.all([Promise.resolve().then(() => gateway.pay(pending.sessionId)), settleHold(pending.bookingId, gateway)])
      const booking = await bookingOf(pending.bookingId)
      const lines = await db.select().from(bikeReservations).where(eq(bikeReservations.bookingId, pending.bookingId))
      const states = [...new Set(lines.map((line) => line.status))]
      if (booking.status === 'confirmed') {
        expect(result).toBe('confirmed')
        expect(states).toEqual(['confirmed'])
      } else {
        // the session was closed before the card: the customer cannot pay it any more
        expect(booking.status).toBe('expired')
        expect(states).toEqual(['expired'])
        expect((await gateway.getSession(pending.sessionId)).status).toBe('expired')
      }
      await db.delete(bikeReservations).where(eq(bikeReservations.bookingId, pending.bookingId))
      await db.delete(bookings).where(eq(bookings.id, pending.bookingId))
    }
  })

  describe('the sweeper', () => {
    it('settles the bookings whose time has run out and leaves the others', async () => {
      const late = await startPendingBooking(fx, gateway, RANGE, 1)
      const other = await createFixture(1)
      try {
        const fresh = await startPendingBooking(other, gateway, RANGE, 1)
        await makeOverdue(late.bookingId)
        const swept = await settleOverdueHolds(gateway)
        expect(swept.failed).toBe(0)
        expect(swept.settled).toBeGreaterThanOrEqual(1)
        expect((await bookingOf(late.bookingId)).status).toBe('expired')
        expect((await bookingOf(fresh.bookingId)).status).toBe('pending')
      } finally { await other.cleanup() }
    })

    it('settles an overdue booking that was paid: it confirms it', async () => {
      const paid = await startPendingBooking(fx, gateway, RANGE, 1)
      gateway.pay(paid.sessionId)
      await makeOverdue(paid.bookingId)
      await settleOverdueHolds(gateway)
      expect((await bookingOf(paid.bookingId)).status).toBe('confirmed')
    })

    it('one booking that fails does not stop the others', async () => {
      const bad = await startPendingBooking(fx, gateway, RANGE, 1)
      const good = await createFixture(1)
      try {
        const fine = await startPendingBooking(good, gateway, RANGE, 1)
        await makeOverdue(bad.bookingId)
        await makeOverdue(fine.bookingId)
        const broken = new FakeGateway(new Map(), new Map())
        const real = gateway.expireSession.bind(gateway)
        broken.expireSession = async (id: string) => { if (id === bad.sessionId) throw new Error('gateway down'); return real(id) }
        broken.getSession = gateway.getSession.bind(gateway)
        const swept = await settleOverdueHolds(broken)
        expect(swept.failed).toBe(1)
        expect((await bookingOf(bad.bookingId)).status).toBe('pending')
        expect((await bookingOf(fine.bookingId)).status).toBe('expired')
      } finally { await good.cleanup() }
    })
  })
})
