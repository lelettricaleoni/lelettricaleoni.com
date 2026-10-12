import { describe, expect, it, vi } from 'vitest'
import Stripe from 'stripe'
import { handleStripeWebhook } from './stripe-webhook'

vi.mock('server-only', () => ({}))
// The database is not touched here: the work is passed in.
vi.mock('./stripe-events', () => ({ processStripeEvent: vi.fn() }))

const SECRET = 'whsec_test_secret'
const payload = JSON.stringify({ id: 'evt_1', object: 'event', type: 'checkout.session.completed', data: { object: { id: 'cs_1' } } })
const sign = (body: string, secret = SECRET, timestamp?: number) => Stripe.webhooks.generateTestHeaderString({ payload: body, secret, timestamp })

describe('the answer to the call of Stripe', () => {
  it('works on an event whose signature is genuine, and says so', async () => {
    const work = vi.fn().mockResolvedValue({ status: 'handled' })
    expect(await handleStripeWebhook(payload, sign(payload), SECRET, work)).toEqual({ status: 200, body: { received: true } })
    expect(work).toHaveBeenCalledOnce()
    expect(work.mock.calls[0][0]).toMatchObject({ id: 'evt_1', type: 'checkout.session.completed' })
  })

  it('passes on which booking this call confirmed, for the calendar', async () => {
    const work = vi.fn().mockResolvedValue({ status: 'handled', confirmedBookingId: 'b1' })
    expect(await handleStripeWebhook(payload, sign(payload), SECRET, work)).toMatchObject({ status: 200, confirmedBookingId: 'b1' })
  })

  it('says it was a duplicate, still with a 200 so that Stripe stops sending it', async () => {
    const work = vi.fn().mockResolvedValue({ status: 'duplicate' })
    expect(await handleStripeWebhook(payload, sign(payload), SECRET, work)).toEqual({ status: 200, body: { received: true, duplicate: true } })
  })

  it('refuses, and works on nothing, a signature made with another secret', async () => {
    const work = vi.fn()
    expect((await handleStripeWebhook(payload, sign(payload, 'whsec_other'), SECRET, work)).status).toBe(400)
    expect(work).not.toHaveBeenCalled()
  })

  it('refuses a body that is not the one that was signed', async () => {
    const work = vi.fn()
    const tampered = payload.replace('cs_1', 'cs_2')
    expect((await handleStripeWebhook(tampered, sign(payload), SECRET, work)).status).toBe(400)
    expect(work).not.toHaveBeenCalled()
  })

  it('refuses a signature that is too old (a recorded call sent again)', async () => {
    const work = vi.fn()
    const old = Math.floor(Date.now() / 1000) - 3600
    expect((await handleStripeWebhook(payload, sign(payload, SECRET, old), SECRET, work)).status).toBe(400)
    expect(work).not.toHaveBeenCalled()
  })

  it('refuses a call without a signature', async () => {
    const work = vi.fn()
    expect((await handleStripeWebhook(payload, null, SECRET, work)).status).toBe(400)
    expect(work).not.toHaveBeenCalled()
  })

  it('does not take anybody at their word where no secret is set', async () => {
    const work = vi.fn()
    expect((await handleStripeWebhook(payload, sign(payload, 'whsec_x'), undefined, work)).status).toBe(503)
    expect(work).not.toHaveBeenCalled()
  })

  it('answers 500 when the work fails, so that Stripe sends the event again, and logs without the message of the error', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const work = vi.fn().mockRejectedValue(new Error('Failed query: update bookings ... params: anna@example.test'))
    expect(await handleStripeWebhook(payload, sign(payload), SECRET, work)).toEqual({ status: 500, body: { error: 'Could not process the event' } })
    expect(JSON.stringify(log.mock.calls)).not.toContain('anna@example.test')
    log.mockRestore()
  })
})
