import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, bikeCategories, bikeModels, bikeReservations, bookings } from '@/lib/db'
import { FakeGateway } from '@/lib/booking/payments/fake'
import { beginCheckout, type BeginCheckoutInput } from '@/lib/booking/checkout'
import { getFreeBikes } from '@/lib/booking/availability'
import { createFixture, type Fixture } from './fixtures'

const TODAY = '2031-10-01'
const STAY = { startsOn: '2031-11-03', endsOn: '2031-11-06' } // 3 days

describe('beginCheckout', () => {
  let fx: Fixture
  let gateway: FakeGateway
  beforeEach(async () => {
    fx = await createFixture(3)
    gateway = new FakeGateway(new Map(), new Map())
    const [model] = await db.select().from(bikeModels).where(eq(bikeModels.id, fx.modelId))
    await db.update(bikeCategories).set({ day1Price: '10', day2Price: '18', day3Price: '24', maxRentalDays: 3 })
      .where(eq(bikeCategories.id, model.categoryId))
    await db.update(bikeModels).set({ isPublished: true }).where(eq(bikeModels.id, fx.modelId))
  })
  afterEach(async () => { vi.unstubAllEnvs(); await fx.cleanup() })

  const cart = (quantity: number) => [{ bikeModelId: fx.modelId, bikeSizeId: fx.sizeId, bikeVersionId: fx.versionId, quantity }]
  const request = (overrides: Partial<BeginCheckoutInput> = {}): BeginCheckoutInput => ({
    bookingKey: crypto.randomUUID(), customerId: fx.customerId, customerEmail: 'db-test@example.test', language: 'it',
    ...STAY, cart: cart(1), today: TODAY,
    urls: (bookingId) => ({ successUrl: `https://example.test/ok/${bookingId}`, cancelUrl: `https://example.test/back/${bookingId}` }),
    ...overrides,
  })
  const free = async () => (await getFreeBikes(STAY, { publishedOnly: false })).find((r) => r.bikeModelId === fx.modelId)?.free ?? 0
  const bookingOf = async (id: string) => (await db.select().from(bookings).where(eq(bookings.id, id)))[0]
  const mine = () => db.select().from(bookings).where(eq(bookings.customerId, fx.customerId))

  it("holds the bikes, opens a payment session for the server's price and sends the customer to it", async () => {
    const result = await beginCheckout(request({ cart: cart(2) }), gateway)
    if (result.status !== 'redirect') throw new Error(`expected redirect, got ${result.status}`)
    expect(result.url).toMatch(/^\/it\/rent\/fake-checkout\/fake_cs_/)
    expect(await free()).toBe(1)
    const booking = await bookingOf(result.bookingId)
    expect(booking).toMatchObject({ status: 'pending', totalCents: 4800, stripeSessionId: result.url.split('/').pop() })
    const session = gateway.describe(booking.stripeSessionId!)
    expect(session?.lines).toHaveLength(2)
    expect(session?.lines.every((line) => line.amountCents === 2400)).toBe(true)
    expect(session?.successUrl).toBe(`https://example.test/ok/${result.bookingId}`)
    expect(session?.cancelUrl).toBe(`https://example.test/back/${result.bookingId}`)
  })

  it('checks the request itself, before touching anything', async () => {
    expect(await beginCheckout(request({ cart: [] }), gateway)).toEqual({ status: 'invalid', reason: 'cart' })
    expect(await beginCheckout(request({ cart: cart(11) }), gateway)).toEqual({ status: 'invalid', reason: 'cart' })
    expect(await beginCheckout(request({ startsOn: TODAY, endsOn: '2031-10-03' }), gateway)).toEqual({ status: 'invalid', reason: 'too_soon' })
    expect(await beginCheckout(request({ startsOn: '2032-12-01', endsOn: '2032-12-03' }), gateway)).toEqual({ status: 'invalid', reason: 'too_far' })
    expect(await beginCheckout(request({ startsOn: '2031-11-06', endsOn: '2031-11-03' }), gateway)).toEqual({ status: 'invalid', reason: 'not_a_range' })
    expect(await mine()).toHaveLength(0)
    expect(gateway.sessionCount()).toBe(0)
  })

  it('names the line the category cannot rent for that long, and holds nothing', async () => {
    const result = await beginCheckout(request({ startsOn: '2031-11-03', endsOn: '2031-11-08' }), gateway) // 5 days, max 3
    expect(result).toEqual({ status: 'too_many_days', lineIndex: 0, maxDays: 3 })
    expect(await mine()).toHaveLength(0)
  })

  it('says which line has no bike left, frees the others and leaves nothing pending', async () => {
    const result = await beginCheckout(request({ cart: cart(4) }), gateway) // 3 bikes in the fixture
    expect(result).toEqual({ status: 'bike_unavailable', lineIndex: 3 })
    expect(await free()).toBe(3)
    expect((await mine()).filter((b) => b.status === 'pending')).toHaveLength(0)
    expect(gateway.sessionCount()).toBe(0)
  })

  it('asking again with the same key goes to the same payment page: no second booking, no second session', async () => {
    const same = request()
    const first = await beginCheckout(same, gateway)
    const second = await beginCheckout(same, gateway)
    if (first.status !== 'redirect' || second.status !== 'redirect') throw new Error('expected redirect twice')
    expect(second.bookingId).toBe(first.bookingId)
    expect(second.url).toBe(first.url)
    expect(gateway.sessionCount()).toBe(1)
    expect(await mine()).toHaveLength(1)
  })

  it('asking again after the customer has paid says it is paid', async () => {
    const same = request()
    const first = await beginCheckout(same, gateway)
    if (first.status !== 'redirect') throw new Error('setup')
    gateway.pay(first.url.split('/').pop()!)
    expect(await beginCheckout(same, gateway)).toEqual({ status: 'already_paid', bookingId: first.bookingId })
  })

  it('a new request while another payment is open ends the old one and starts the new: the customer is never stuck', async () => {
    const first = await beginCheckout(request(), gateway)
    if (first.status !== 'redirect') throw new Error('setup')
    const second = await beginCheckout(request({ cart: cart(2) }), gateway)
    if (second.status !== 'redirect') throw new Error(`expected redirect, got ${second.status}`)
    expect((await bookingOf(first.bookingId)).status).toBe('expired')
    expect(await gateway.getSession(first.url.split('/').pop()!)).toEqual({ status: 'expired' })
    expect((await bookingOf(second.bookingId)).status).toBe('pending')
    expect(await free()).toBe(1) // only the two bikes of the new booking are held
  })

  it('a new request while the previous payment was already made confirms the old one and starts the new', async () => {
    const first = await beginCheckout(request(), gateway)
    if (first.status !== 'redirect') throw new Error('setup')
    gateway.pay(first.url.split('/').pop()!)
    const second = await beginCheckout(request(), gateway)
    expect(second.status).toBe('redirect')
    expect((await bookingOf(first.bookingId)).status).toBe('confirmed')
  })

  it('two tabs of the same customer at once, with two different keys: one payment stays open, and only its bikes are held', async () => {
    const results = await Promise.all([beginCheckout(request({ cart: cart(1) }), gateway), beginCheckout(request({ cart: cart(2) }), gateway)])
    const open = (await mine()).filter((b) => b.status === 'pending')
    expect(open).toHaveLength(1)
    const winner = open[0]
    // the bikes held are the winner's, and only them
    const held = (await db.select().from(bikeReservations).where(eq(bikeReservations.customerId, fx.customerId))).filter((l) => l.status === 'held')
    expect(held.length).toBeGreaterThan(0)
    expect(held.every((line) => line.bookingId === winner.id)).toBe(true)
    // whoever was sent to pay for another booking holds a session that can no longer be paid
    for (const result of results) {
      if (result.status === 'redirect' && result.bookingId !== winner.id) {
        expect(await gateway.getSession(result.url.split('/').pop()!)).toEqual({ status: 'expired' })
      }
    }
    // at least one of them got through, and nobody was told something impossible
    expect(results.some((r) => r.status === 'redirect')).toBe(true)
    expect(results.every((r) => ['redirect', 'closed', 'has_pending', 'in_progress', 'try_again'].includes(r.status))).toBe(true)
  })

  it('in production without Stripe it holds nothing and says payments are not available', async () => {
    vi.stubEnv('APP_ENV', 'production')
    expect(await beginCheckout(request())).toEqual({ status: 'payments_unavailable' }) // no gateway passed: the factory refuses
    expect(await mine()).toHaveLength(0)
    expect(await free()).toBe(3)
  })

  it('frees the bikes and gives the error back when the gateway cannot open a session', async () => {
    const broken = new FakeGateway(new Map(), new Map())
    broken.createSession = async () => { throw new Error('gateway down') }
    await expect(beginCheckout(request(), broken)).rejects.toThrow('gateway down')
    expect(await free()).toBe(3)
    expect((await mine()).filter((b) => b.status === 'pending')).toHaveLength(0)
  })
})
