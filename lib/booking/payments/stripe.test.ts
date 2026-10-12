import { describe, expect, it, vi } from 'vitest'
import Stripe from 'stripe'
import { StripeGateway, stripeKeyMode } from './stripe'
import type { CreateSessionInput } from './gateway'
import { HOLD_MINUTES } from '@/lib/booking/rules'

/*
 * The Stripe gateway against a client that never touches the network (the actions must not, in tests): what we ASK of Stripe, and how
 * each answer and each failure is read. The words of Stripe's API are the SDK's types, so a wrong field fails the type check too.
 * The same calls against Stripe itself are in stripe.live.test.ts (skipped unless LIVE_STRIPE=1).
 */

const NOW = new Date('2031-06-01T10:00:00Z')

function client() {
  const sessions = { create: vi.fn(), retrieve: vi.fn(), expire: vi.fn() }
  const refunds = { create: vi.fn() }
  return { stripe: { checkout: { sessions }, refunds } as unknown as Stripe, sessions, refunds }
}

const input = (over: Partial<CreateSessionInput> = {}): CreateSessionInput => ({
  bookingId: 'b1', bookingKey: 'key-1', customerEmail: 'anna@example.test', language: 'de',
  lines: [{ label: 'Flyer Uproc 2 (M)', amountCents: 4500 }, { label: 'Flyer Gotour (L)', amountCents: 3000 }],
  expiresAt: new Date(NOW.getTime() + 30 * 60_000), successUrl: 'https://x.test/ok', cancelUrl: 'https://x.test/no', ...over,
})

const invalidRequest = (code = 'resource_invalid') => new Stripe.errors.StripeInvalidRequestError({ message: 'no', type: 'invalid_request_error', code })

describe('the key of a Stripe account says where it may be used', () => {
  it('reads the mode from the prefix of a secret or a restricted key', () => {
    expect(stripeKeyMode('sk_test_abc')).toBe('test')
    expect(stripeKeyMode('rk_test_abc')).toBe('test')
    expect(stripeKeyMode('sk_live_abc')).toBe('live')
    expect(stripeKeyMode('rk_live_abc')).toBe('live')
  })
  it('refuses anything else, so a typo is not taken for a key', () => {
    expect(() => stripeKeyMode('pk_test_abc')).toThrow()
    expect(() => stripeKeyMode('')).toThrow()
  })
})

describe('opening a payment session', () => {
  it('asks for a one-off card payment with a line per bike, the booking written on it, and the booking key as idempotency key', async () => {
    const { stripe, sessions } = client()
    sessions.create.mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.test/c/pay/cs_1' })
    const created = await new StripeGateway(stripe, () => NOW).createSession(input())
    expect(created).toEqual({ id: 'cs_1', url: 'https://checkout.stripe.test/c/pay/cs_1' })

    const [params, options] = sessions.create.mock.calls[0]
    expect(params).toMatchObject({
      mode: 'payment', allowed_payment_method_types: ['card'], submit_type: 'book', client_reference_id: 'b1', metadata: { booking_id: 'b1' },
      customer_email: 'anna@example.test', locale: 'de', success_url: 'https://x.test/ok', cancel_url: 'https://x.test/no',
    })
    expect(params.line_items).toEqual([
      { quantity: 1, price_data: { currency: 'eur', unit_amount: 4500, product_data: { name: 'Flyer Uproc 2 (M)' } } },
      { quantity: 1, price_data: { currency: 'eur', unit_amount: 3000, product_data: { name: 'Flyer Gotour (L)' } } },
    ])
    expect(options).toEqual({ idempotencyKey: 'checkout-key-1' })
  })

  it('gives Stripe at least 31 minutes, because its minimum is 30 and the bikes are held for less (the hold closes the session itself)', async () => {
    const { stripe, sessions } = client()
    sessions.create.mockResolvedValue({ id: 'cs_1', url: 'https://x.test/p' })
    await new StripeGateway(stripe, () => NOW).createSession(input({ expiresAt: new Date(NOW.getTime() + HOLD_MINUTES * 60_000) }))
    expect(sessions.create.mock.calls[0][0].expires_at).toBe(Math.floor(NOW.getTime() / 1000) + 31 * 60)
  })

  it('keeps a later expiry as it is', async () => {
    const { stripe, sessions } = client()
    sessions.create.mockResolvedValue({ id: 'cs_1', url: 'https://x.test/p' })
    const later = new Date(NOW.getTime() + 2 * 3600_000)
    await new StripeGateway(stripe, () => NOW).createSession(input({ expiresAt: later }))
    expect(sessions.create.mock.calls[0][0].expires_at).toBe(Math.floor(later.getTime() / 1000))
  })

  it('lets Stripe choose the language when ours is not one of its own', async () => {
    const { stripe, sessions } = client()
    sessions.create.mockResolvedValue({ id: 'cs_1', url: 'https://x.test/p' })
    await new StripeGateway(stripe, () => NOW).createSession(input({ language: 'xx' }))
    expect(sessions.create.mock.calls[0][0].locale).toBe('auto')
  })

  it('throws when Stripe gives no address to pay at: nobody can be sent anywhere', async () => {
    const { stripe, sessions } = client()
    sessions.create.mockResolvedValue({ id: 'cs_1', url: null })
    await expect(new StripeGateway(stripe, () => NOW).createSession(input())).rejects.toThrow()
  })
})

describe('reading a session', () => {
  const read = async (session: object) => {
    const { stripe, sessions } = client()
    sessions.retrieve.mockResolvedValue(session)
    return new StripeGateway(stripe, () => NOW).getSession('cs_1')
  }

  it('is open while it can still be paid', async () => {
    expect(await read({ id: 'cs_1', status: 'open', url: 'https://x.test/p' })).toEqual({ status: 'open', url: 'https://x.test/p' })
  })
  it('is paid when it is complete and the money arrived, with the payment to refund', async () => {
    expect(await read({ id: 'cs_1', status: 'complete', payment_status: 'paid', payment_intent: 'pi_1' })).toEqual({ status: 'paid', paymentRef: 'pi_1' })
  })
  it('reads the payment of an expanded object too', async () => {
    expect(await read({ id: 'cs_1', status: 'complete', payment_status: 'paid', payment_intent: { id: 'pi_2' } })).toEqual({ status: 'paid', paymentRef: 'pi_2' })
  })
  it('is expired when Stripe says so', async () => {
    expect(await read({ id: 'cs_1', status: 'expired' })).toEqual({ status: 'expired' })
  })
  it('throws on a complete session whose money has not arrived: only cards are offered, so this is not a thing to guess about', async () => {
    await expect(read({ id: 'cs_1', status: 'complete', payment_status: 'unpaid', payment_intent: 'pi_1' })).rejects.toThrow()
  })
  it('throws on a paid session without a payment: there would be nothing to refund', async () => {
    await expect(read({ id: 'cs_1', status: 'complete', payment_status: 'paid', payment_intent: null })).rejects.toThrow()
  })
})

describe('closing a session', () => {
  it('says it was closed when Stripe closed it', async () => {
    const { stripe, sessions } = client()
    sessions.expire.mockResolvedValue({ id: 'cs_1', status: 'expired' })
    expect(await new StripeGateway(stripe, () => NOW).expireSession('cs_1')).toBe('expired')
  })

  it('says "not open" when Stripe refuses and the session is paid or already expired', async () => {
    for (const status of ['complete', 'expired']) {
      const { stripe, sessions } = client()
      sessions.expire.mockRejectedValue(invalidRequest())
      sessions.retrieve.mockResolvedValue({ id: 'cs_1', status })
      expect(await new StripeGateway(stripe, () => NOW).expireSession('cs_1')).toBe('not_open')
    }
  })

  it('throws when Stripe refuses but the session is still open: nothing is known about why', async () => {
    const { stripe, sessions } = client()
    sessions.expire.mockRejectedValue(invalidRequest())
    sessions.retrieve.mockResolvedValue({ id: 'cs_1', status: 'open' })
    await expect(new StripeGateway(stripe, () => NOW).expireSession('cs_1')).rejects.toThrow()
  })

  it('throws on anything that is not a refusal (a dropped connection may have closed it or not)', async () => {
    const { stripe, sessions } = client()
    sessions.expire.mockRejectedValue(new Stripe.errors.StripeConnectionError({ message: 'down', type: 'api_error' }))
    await expect(new StripeGateway(stripe, () => NOW).expireSession('cs_1')).rejects.toThrow()
    expect(sessions.retrieve).not.toHaveBeenCalled()
  })
})

describe('giving money back', () => {
  const request = { reservationId: 'r1', attempt: 2, paymentRef: 'pi_1', amountCents: 4500 }

  it('asks for the amount of that bike, on that payment, with the reservation and the attempt as idempotency key', async () => {
    const { stripe, refunds } = client()
    refunds.create.mockResolvedValue({ id: 're_1', status: 'succeeded' })
    expect(await new StripeGateway(stripe, () => NOW).refund(request)).toEqual({ status: 'succeeded', refundRef: 're_1' })
    expect(refunds.create).toHaveBeenCalledWith(
      { payment_intent: 'pi_1', amount: 4500, metadata: { reservation_id: 'r1', attempt: '2' } },
      { idempotencyKey: 'refund-r1-2' },
    )
  })

  it('says pending for a refund that is on its way', async () => {
    const { stripe, refunds } = client()
    refunds.create.mockResolvedValue({ id: 're_1', status: 'pending' })
    expect(await new StripeGateway(stripe, () => NOW).refund(request)).toEqual({ status: 'pending', refundRef: 're_1' })
  })

  it('says failed for a refund Stripe made and then could not do', async () => {
    const { stripe, refunds } = client()
    refunds.create.mockResolvedValue({ id: 're_1', status: 'failed', failure_reason: 'expired_or_canceled_card' })
    expect(await new StripeGateway(stripe, () => NOW).refund(request)).toEqual({ status: 'failed', reason: 'expired_or_canceled_card' })
  })

  it('says failed for a refusal, with Stripe\'s code and never its message (it may name the payment)', async () => {
    const { stripe, refunds } = client()
    refunds.create.mockRejectedValue(invalidRequest('charge_already_refunded'))
    expect(await new StripeGateway(stripe, () => NOW).refund(request)).toEqual({ status: 'failed', reason: 'charge_already_refunded' })
  })

  it('throws, and does not say failed, whenever it is not certain that no refund was made', async () => {
    for (const error of [
      new Stripe.errors.StripeConnectionError({ message: 'down', type: 'api_error' }),
      new Stripe.errors.StripeAPIError({ message: 'oops', type: 'api_error' }),
      new Stripe.errors.StripeIdempotencyError({ message: 'in use', type: 'idempotency_error' }),
      new Stripe.errors.StripeRateLimitError({ message: 'slow down', type: 'rate_limit_error' }),
    ]) {
      const { stripe, refunds } = client()
      refunds.create.mockRejectedValue(error)
      await expect(new StripeGateway(stripe, () => NOW).refund(request)).rejects.toThrow()
    }
  })
})
