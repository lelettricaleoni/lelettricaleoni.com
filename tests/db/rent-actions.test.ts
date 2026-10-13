import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import type { User } from '@supabase/supabase-js'
import { db, bikeCategories, bikeModels, bikeReservations, bookings, customers } from '@/lib/db'
import { FakeGateway } from '@/lib/booking/payments/fake'
import { getFakeGateway } from '@/lib/booking/payments'
import {
  abandonMyCheckout, cancelMyBike, confirmMyBooking, payWithFakeCard, resumeMyCheckout, startCheckoutForUser, type StartCheckoutRequest,
} from '@/lib/booking/rent-actions'
import { parseRentState } from '@/lib/booking/rent-url'
import { SITE_URL } from '@/lib/auth/urls'
import type { ShopSchedule } from '@/lib/shop-schedule'
import { createFixture, insertPaidBooking, startPendingBooking, type Fixture } from './fixtures'

const STAY = { startsOn: '2031-11-03', endsOn: '2031-11-06' }
const TODAY = '2031-10-01'
const ORIGIN = SITE_URL

describe('the booking actions of a signed-in person', () => {
  let fx: Fixture
  let gateway: FakeGateway
  let userId: string
  const strangers: string[] = []

  const userOf = (overrides: Partial<User> = {}) => ({
    id: userId, email: 'rent-test@example.test', email_confirmed_at: '2031-01-01T00:00:00Z',
    app_metadata: {}, user_metadata: {}, identities: [], ...overrides,
  }) as unknown as User

  beforeEach(async () => {
    fx = await createFixture(3)
    gateway = new FakeGateway(new Map(), new Map())
    userId = crypto.randomUUID()
    await db.update(customers).set({ userId, email: 'rent-test@example.test', phone: '+393481234567' }).where(eq(customers.id, fx.customerId))
    const [model] = await db.select().from(bikeModels).where(eq(bikeModels.id, fx.modelId))
    await db.update(bikeCategories).set({ day1Price: '10', day2Price: '18', day3Price: '24', maxRentalDays: 3 })
      .where(eq(bikeCategories.id, model.categoryId))
    await db.update(bikeModels).set({ isPublished: true }).where(eq(bikeModels.id, fx.modelId))
  })
  afterEach(async () => {
    await fx.cleanup()
    for (const id of strangers.splice(0)) await db.delete(customers).where(eq(customers.id, id))
  })

  const request = (overrides: Partial<StartCheckoutRequest> = {}): StartCheckoutRequest => ({
    bookingKey: crypto.randomUUID(), range: STAY, language: 'it', acceptTerms: true,
    cart: [{ bikeModelId: fx.modelId, bikeSizeId: fx.sizeId, bikeVersionId: fx.versionId, quantity: 1 }],
    ...overrides,
  })
  const customerRow = async () => (await db.select().from(customers).where(eq(customers.id, fx.customerId)))[0]
  const mine = () => db.select().from(bookings).where(eq(bookings.customerId, fx.customerId))

  describe('starting a payment', () => {
    it('sends the person to pay, with the pages to come back to on this site', async () => {
      const result = await startCheckoutForUser(userOf(), request(), gateway, { today: TODAY })
      if (result.status !== 'redirect') throw new Error(`expected redirect, got ${result.status}`)
      expect(result.url).toMatch(/^\/it\/rent\/fake-checkout\/fake_cs_/)
      const [booking] = await mine()
      expect(booking).toMatchObject({ status: 'pending', totalCents: 2400, language: 'it' })
      const session = gateway.describe(booking.stripeSessionId!)
      expect(session?.successUrl).toBe(`${ORIGIN}/it/account/rents/${booking.id}?paid=1`)
      expect(session?.cancelUrl).toBe(`${ORIGIN}/it/rent/cancelled/${booking.id}`)
    })

    it('is not talked into another site, or another path, by the language it is given: only the three languages exist', async () => {
      const result = await startCheckoutForUser(userOf(), request({ language: '//evil.example/x' }), gateway, { today: TODAY })
      if (result.status !== 'redirect') throw new Error(`expected redirect, got ${result.status}`)
      expect(result.url).toMatch(/^\/it\/rent\/fake-checkout\//)
      const [booking] = await mine()
      expect(booking.language).toBe('it')
      const session = gateway.describe(booking.stripeSessionId!)
      expect(session?.successUrl).toBe(`${ORIGIN}/it/account/rents/${booking.id}?paid=1`)
      expect(session?.cancelUrl).toBe(`${ORIGIN}/it/rent/cancelled/${booking.id}`)
    })

    it('does not accept as today a day the caller makes up: from tomorrow is from tomorrow in Rome', async () => {
      // no `today` option: the real today decides, so a stay in 2031 is far beyond the 180 days
      expect(await startCheckoutForUser(userOf(), request(), gateway)).toEqual({ status: 'invalid', reason: 'too_far' })
      expect(await mine()).toHaveLength(0)
    })

    describe('with the days the shop is closed', () => {
      // STAY is Monday 3 to Wednesday 5 November 2031.
      const DAY = [{ opensAt: '09:00', closesAt: '19:00' }]
      const openExcept = (...closedWeekdays: number[]): ShopSchedule =>
        ({ weekly: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((weekday) => [weekday, closedWeekdays.includes(weekday) ? [] : DAY])), closures: [] })

      it('refuses a stay whose first day is closed, and holds nothing', async () => {
        const result = await startCheckoutForUser(userOf(), request(), gateway, { today: TODAY, schedule: openExcept(1) })
        expect(result).toEqual({ status: 'invalid', reason: 'closed_day' })
        expect(await mine()).toHaveLength(0)
      })

      it('refuses a stay whose last day is closed, even by a closure that is not a weekday', async () => {
        const closure: ShopSchedule = { ...openExcept(), closures: [{ startsOn: '2031-11-05', endsOn: '2031-11-06' }] }
        const result = await startCheckoutForUser(userOf(), request(), gateway, { today: TODAY, schedule: closure })
        expect(result).toEqual({ status: 'invalid', reason: 'closed_day' })
        expect(await mine()).toHaveLength(0)
      })

      it('lets a stay through a day that is closed in the middle', async () => {
        const result = await startCheckoutForUser(userOf(), request(), gateway, { today: TODAY, schedule: openExcept(2) })
        expect(result.status).toBe('redirect')
        expect(await mine()).toHaveLength(1)
      })
    })

    it('does not book without the terms being accepted', async () => {
      expect(await startCheckoutForUser(userOf(), request({ acceptTerms: false }), gateway, { today: TODAY })).toEqual({ status: 'terms_required' })
      expect(await mine()).toHaveLength(0)
    })

    it('does not book for an account whose email is not confirmed', async () => {
      expect(await startCheckoutForUser(userOf({ email_confirmed_at: undefined }), request(), gateway, { today: TODAY })).toEqual({ status: 'not_allowed' })
      expect(await mine()).toHaveLength(0)
    })

    it('books for an account of the shop exactly as for any other: the role gives the panel and takes nothing from the public site', async () => {
      const result = await startCheckoutForUser(userOf({ app_metadata: { role: 'admin' } }), request(), gateway, { today: TODAY })
      expect(result.status).toBe('redirect')
      expect(await mine()).toHaveLength(1)
    })

    it('asks for a phone when the profile has none, refuses one that is not valid, and saves a good one in the profile', async () => {
      await db.update(customers).set({ phone: null }).where(eq(customers.id, fx.customerId))
      expect(await startCheckoutForUser(userOf(), request(), gateway, { today: TODAY })).toEqual({ status: 'needs_phone' })
      expect(await startCheckoutForUser(userOf(), request({ phone: '12' }), gateway, { today: TODAY })).toEqual({ status: 'invalid_phone' })
      expect(await mine()).toHaveLength(0)
      const result = await startCheckoutForUser(userOf(), request({ phone: '348 765 4321', phoneCountry: 'IT' }), gateway, { today: TODAY })
      expect(result.status).toBe('redirect')
      expect((await customerRow()).phone).toBe('+393487654321')
    })

    it('never replaces the phone the profile already has: that is for the account settings', async () => {
      await startCheckoutForUser(userOf(), request({ phone: '+393489999999' }), gateway, { today: TODAY })
      expect((await customerRow()).phone).toBe('+393481234567')
    })

    it('passes on what the engine says: a bike that is not free, a stay too long, a page that does not exist in production', async () => {
      const tooMany = request({ cart: [{ bikeModelId: fx.modelId, bikeSizeId: fx.sizeId, bikeVersionId: fx.versionId, quantity: 4 }] })
      expect(await startCheckoutForUser(userOf(), tooMany, gateway, { today: TODAY })).toEqual({ status: 'bike_unavailable', lineIndex: 3 })
      expect(await startCheckoutForUser(userOf(), request({ range: { startsOn: '2031-11-03', endsOn: '2031-11-09' } }), gateway, { today: TODAY }))
        .toMatchObject({ status: 'too_many_days', maxDays: 3 })
    })

    it('says a booking already paid is paid', async () => {
      const same = request()
      const first = await startCheckoutForUser(userOf(), same, gateway, { today: TODAY })
      if (first.status !== 'redirect') throw new Error('setup')
      gateway.pay(first.url.split('/').pop()!)
      const again = await startCheckoutForUser(userOf(), same, gateway, { today: TODAY })
      expect(again).toMatchObject({ status: 'already_paid' })
    })
  })

  describe('what is theirs and what is not', () => {
    async function otherCustomer() {
      const [row] = await db.insert(customers).values({ firstName: 'db-test', lastName: `other-${crypto.randomUUID()}`, userId: crypto.randomUUID() }).returning()
      strangers.push(row.id)
      return row
    }

    it('cancels a bike of theirs and gives the refund back', async () => {
      const paid = await insertPaidBooking(fx, { startsOn: '2031-12-10', endsOn: '2031-12-13' }, [3000])
      const result = await cancelMyBike(userOf(), paid.reservationIds[0], gateway, new Date('2031-12-01T10:00:00Z'))
      expect(result).toMatchObject({ status: 'cancelled', refundedCents: 3000, refund: 'succeeded' })
    })

    it('does not cancel the bike of somebody else, even with its id: it is "not found"', async () => {
      const other = await otherCustomer()
      const paid = await insertPaidBooking(fx, { startsOn: '2031-12-10', endsOn: '2031-12-13' }, [3000])
      const asStranger = userOf({ id: other.userId! })
      expect(await cancelMyBike(asStranger, paid.reservationIds[0], gateway, new Date('2031-12-01T10:00:00Z'))).toEqual({ status: 'not_found' })
      const [row] = await db.select().from(bikeReservations).where(eq(bikeReservations.id, paid.reservationIds[0]))
      expect(row.status).toBe('confirmed')
      expect(gateway.refundCount()).toBe(0)
    })

    it('does not cancel anything for a person with no customer, nor for somebody else\'s bike (staff included: a role is not ownership)', async () => {
      const paid = await insertPaidBooking(fx, { startsOn: '2031-12-10', endsOn: '2031-12-13' }, [3000])
      expect(await cancelMyBike(userOf({ id: crypto.randomUUID(), email: 'nobody@example.test' }), paid.reservationIds[0], gateway)).toEqual({ status: 'not_found' })
      expect(await cancelMyBike(userOf({ id: crypto.randomUUID(), email: 'staff@example.test', app_metadata: { role: 'admin' } }), paid.reservationIds[0], gateway)).toEqual({ status: 'not_found' })
    })

    it('lets an account of the shop cancel its own bike like anybody', async () => {
      const paid = await insertPaidBooking(fx, { startsOn: '2031-12-10', endsOn: '2031-12-13' }, [3000])
      const result = await cancelMyBike(userOf({ app_metadata: { role: 'admin' } }), paid.reservationIds[0], gateway)
      expect(result.status).toBe('cancelled')
    })

    it('confirms their own paid booking when they land back from the payment page, and nobody else’s', async () => {
      const pending = await startPendingBooking(fx, gateway, STAY, 1)
      gateway.pay(pending.sessionId)
      const other = await otherCustomer()
      expect(await confirmMyBooking(userOf({ id: other.userId! }), pending.bookingId, gateway)).toEqual({ status: 'not_found' })
      expect((await mine())[0].status).toBe('pending')
      expect(await confirmMyBooking(userOf(), pending.bookingId, gateway)).toEqual({ status: 'confirmed' })
      expect((await mine())[0].status).toBe('confirmed')
    })

    it('landing back with nothing paid does not confirm', async () => {
      const pending = await startPendingBooking(fx, gateway, STAY, 1)
      expect(await confirmMyBooking(userOf(), pending.bookingId, gateway)).toEqual({ status: 'not_paid' })
    })

    it('backing out of the payment page frees the bikes at once and brings the cart back', async () => {
      const started = await startCheckoutForUser(userOf(), request({ cart: [{ bikeModelId: fx.modelId, bikeSizeId: fx.sizeId, bikeVersionId: fx.versionId, quantity: 2 }] }), gateway, { today: TODAY })
      if (started.status !== 'redirect') throw new Error('setup')
      const [booking] = await mine()
      const result = await abandonMyCheckout(userOf(), booking.id, 'it', gateway)
      if (result.status !== 'abandoned') throw new Error(`expected abandoned, got ${result.status}`)
      expect((await mine())[0].status).toBe('expired')
      expect(await gateway.getSession(booking.stripeSessionId!)).toEqual({ status: 'expired' })
      const back = Object.fromEntries(new URL(result.href, ORIGIN).searchParams)
      expect(parseRentState(back)).toMatchObject({
        range: STAY, cart: [{ bikeModelId: fx.modelId, bikeSizeId: fx.sizeId, bikeVersionId: fx.versionId, quantity: 2 }],
      })
    })

    it('backing out never sends anyone to another site: the language is one of the three', async () => {
      const started = await startCheckoutForUser(userOf(), request(), gateway, { today: TODAY })
      if (started.status !== 'redirect') throw new Error('setup')
      const [booking] = await mine()
      const result = await abandonMyCheckout(userOf(), booking.id, '//evil.example', gateway)
      if (result.status !== 'abandoned') throw new Error('expected abandoned')
      expect(result.href.startsWith('/it/rent')).toBe(true)
    })

    describe('completing a payment that was left open ("Complete payment")', () => {
      it('sends the person back to the payment page of their own booking while there is time, and changes nothing', async () => {
        const pending = await startPendingBooking(fx, gateway, STAY, 1)
        const result = await resumeMyCheckout(userOf(), pending.bookingId, gateway)
        expect(result).toEqual({ status: 'redirect', url: expect.stringMatching(/^\/it\/rent\/fake-checkout\/fake_cs_/) })
        expect((await mine())[0].status).toBe('pending')
      })

      it('does nothing for somebody else’s booking, and says what it says of one that does not exist', async () => {
        const pending = await startPendingBooking(fx, gateway, STAY, 1)
        const other = await otherCustomer()
        expect(await resumeMyCheckout(userOf({ id: other.userId! }), pending.bookingId, gateway)).toEqual({ status: 'not_found' })
        expect(await resumeMyCheckout(userOf(), crypto.randomUUID(), gateway)).toEqual({ status: 'not_found' })
        expect((await mine())[0].status).toBe('pending')
      })

      it('when the time is up it ends the wait, closing the payment page first, and says it is over', async () => {
        const pending = await startPendingBooking(fx, gateway, STAY, 1)
        const later = new Date(Date.now() + 60 * 60_000)
        expect(await resumeMyCheckout(userOf(), pending.bookingId, gateway, later)).toEqual({ status: 'expired' })
        expect((await mine())[0].status).toBe('expired')
        expect(await gateway.getSession(pending.sessionId)).toEqual({ status: 'expired' })
      })

      it('when the time is up but it was paid in the meantime, the money is not thrown away', async () => {
        const pending = await startPendingBooking(fx, gateway, STAY, 1)
        gateway.pay(pending.sessionId)
        const later = new Date(Date.now() + 60 * 60_000)
        expect(await resumeMyCheckout(userOf(), pending.bookingId, gateway, later)).toEqual({ status: 'paid' })
        expect((await mine())[0].status).toBe('confirmed')
      })

      it('says it is paid when it was paid and the booking is not confirmed yet (the page it goes to confirms it)', async () => {
        const pending = await startPendingBooking(fx, gateway, STAY, 1)
        gateway.pay(pending.sessionId)
        expect(await resumeMyCheckout(userOf(), pending.bookingId, gateway)).toEqual({ status: 'paid' })
      })

      it('a payment page that the gateway already closed ends the wait', async () => {
        const pending = await startPendingBooking(fx, gateway, STAY, 1)
        await gateway.expireSession(pending.sessionId)
        expect(await resumeMyCheckout(userOf(), pending.bookingId, gateway)).toEqual({ status: 'expired' })
        expect((await mine())[0].status).toBe('expired')
      })

      it('a booking that is over (expired, cancelled) is closed, and a confirmed one is paid', async () => {
        const pending = await startPendingBooking(fx, gateway, STAY, 1)
        await db.update(bookings).set({ status: 'expired' }).where(eq(bookings.id, pending.bookingId))
        expect(await resumeMyCheckout(userOf(), pending.bookingId, gateway)).toEqual({ status: 'closed' })
        await db.update(bookings).set({ status: 'confirmed' }).where(eq(bookings.id, pending.bookingId))
        expect(await resumeMyCheckout(userOf(), pending.bookingId, gateway)).toEqual({ status: 'paid' })
      })
    })

    it('backing out of somebody else’s payment page does nothing', async () => {
      const pending = await startPendingBooking(fx, gateway, STAY, 1)
      const other = await otherCustomer()
      expect(await abandonMyCheckout(userOf({ id: other.userId! }), pending.bookingId, 'it', gateway)).toEqual({ status: 'not_found' })
      expect((await mine())[0].status).toBe('pending')
    })

    it('backing out after paying keeps the booking: the money is not thrown away', async () => {
      const pending = await startPendingBooking(fx, gateway, STAY, 1)
      gateway.pay(pending.sessionId)
      const result = await abandonMyCheckout(userOf(), pending.bookingId, 'it', gateway)
      expect(result.status).toBe('paid')
      expect((await mine())[0].status).toBe('confirmed')
    })
  })

  describe('paying with the card that is not one (staging and a laptop only)', () => {
    afterEach(() => vi.unstubAllEnvs())

    it('pays the session of their own booking and says where to go next, as a path of this site', async () => {
      const fake = getFakeGateway()
      const started = await startCheckoutForUser(userOf(), request(), fake, { today: TODAY })
      if (started.status !== 'redirect') throw new Error('setup')
      const [booking] = await mine()
      const result = await payWithFakeCard(userOf(), booking.stripeSessionId!)
      expect(result).toEqual({ status: 'paid', next: `/it/account/rents/${booking.id}?paid=1` })
      expect((await fake.getSession(booking.stripeSessionId!)).status).toBe('paid')
    })

    it('does not pay the session of somebody else', async () => {
      const fake = getFakeGateway()
      const pending = await startPendingBooking(fx, fake, STAY, 1)
      const [other] = await db.insert(customers).values({ firstName: 'db-test', lastName: `other-${crypto.randomUUID()}`, userId: crypto.randomUUID() }).returning()
      strangers.push(other.id)
      expect(await payWithFakeCard(userOf({ id: other.userId! }), pending.sessionId)).toEqual({ status: 'not_found' })
      expect((await fake.getSession(pending.sessionId)).status).toBe('open')
    })

    it('knows no such session', async () => {
      expect(await payWithFakeCard(userOf(), 'fake_cs_nobody')).toEqual({ status: 'not_found' })
    })

    it('does not exist in production: nothing is paid, and nothing is said about sessions', async () => {
      const fake = getFakeGateway()
      const pending = await startPendingBooking(fx, fake, STAY, 1)
      vi.stubEnv('APP_ENV', 'production')
      expect(await payWithFakeCard(userOf(), pending.sessionId)).toEqual({ status: 'unavailable' })
      vi.unstubAllEnvs()
      expect((await fake.getSession(pending.sessionId)).status).toBe('open')
    })

    it('says a session that cannot be paid any more (closed, already paid) is not payable', async () => {
      const fake = getFakeGateway()
      const pending = await startPendingBooking(fx, fake, STAY, 1)
      await fake.expireSession(pending.sessionId)
      expect(await payWithFakeCard(userOf(), pending.sessionId)).toEqual({ status: 'not_payable' })
    })
  })
})
