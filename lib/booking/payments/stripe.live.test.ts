import { describe, expect, it } from 'vitest'
import Stripe from 'stripe'
import { StripeGateway, stripeKeyMode } from './stripe'

/*
 * The same calls as stripe.test.ts, against Stripe itself, in TEST mode. Skipped unless LIVE_STRIPE=1, and it refuses a live key:
 *   LIVE_STRIPE=1 STRIPE_SECRET_KEY=sk_test_... npx vitest run lib/booking/payments/stripe.live.test.ts
 * It opens sessions and closes them again (a session that is not paid costs nothing); no card is charged, so refunds are only asked for
 * a payment that does not exist, which Stripe must refuse.
 */
const key = process.env.STRIPE_SECRET_KEY ?? ''

describe.skipIf(!process.env.LIVE_STRIPE)('Stripe, in test mode', () => {
  it('uses a test key', () => {
    expect(stripeKeyMode(key)).toBe('test')
  })

  const gateway = () => new StripeGateway(new Stripe(key))
  const input = () => ({
    bookingId: crypto.randomUUID(), bookingKey: crypto.randomUUID(), customerEmail: 'live-test@example.test', language: 'it',
    lines: [{ label: 'Flyer (test)', amountCents: 4500 }],
    expiresAt: new Date(Date.now() + 30 * 60_000), successUrl: 'https://staging.lelettricaleoni.com/it/account/rents', cancelUrl: 'https://staging.lelettricaleoni.com/it/rent',
  })

  it('opens a session, reads it as open, closes it, and then says it cannot be closed again', async () => {
    const stripe = gateway()
    const session = await stripe.createSession(input())
    expect(session.url).toMatch(/^https:\/\/checkout\.stripe\.com\//)
    expect(await stripe.getSession(session.id)).toEqual({ status: 'open', url: session.url })

    expect(await stripe.expireSession(session.id)).toBe('expired')
    expect(await stripe.getSession(session.id)).toEqual({ status: 'expired' })
    expect(await stripe.expireSession(session.id)).toBe('not_open')
  })

  it('gives the same session for the same booking key', async () => {
    const stripe = gateway()
    const same = input()
    const first = await stripe.createSession(same)
    const second = await stripe.createSession(same)
    expect(second.id).toBe(first.id)
    await stripe.expireSession(first.id)
  })

  it('refuses a refund of a payment that does not exist, as a certain failure with a code', async () => {
    const result = await gateway().refund({ reservationId: crypto.randomUUID(), attempt: 1, paymentRef: 'pi_does_not_exist', amountCents: 100 })
    expect(result).toMatchObject({ status: 'failed', reason: expect.any(String) })
  })
})
