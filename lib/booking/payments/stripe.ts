import Stripe from 'stripe'
import type { CheckoutSession, CreateSessionInput, ExpireResult, PaymentGateway, RefundRequest, RefundResult, SessionState } from './gateway'

/*
 * Stripe behind the payment seam (./gateway.ts). Checkout is Stripe's own page: no card data, and no Stripe script, ever reaches our
 * pages. Only cards are offered, as a filter on what Checkout would offer (Apple Pay and Google Pay are cards): a card pays at once, and the bikes are held for a few minutes only (`HOLD_MINUTES`), so
 * a method that settles days later (a bank debit) cannot be offered.
 */

/** Stripe's minimum for a session is 30 minutes and our hold is shorter: the session is opened for 31, and `settleHold` closes it when the hold ends. */
const MIN_SESSION_MINUTES = 31

/** The languages Checkout speaks that we do too; anything else lets Stripe look at the browser. */
const LOCALES = new Set(['it', 'en', 'de'])

/** Whether a key is for test money or real money, from its prefix. Anything that is not a secret or restricted key is refused. */
export function stripeKeyMode(key: string): 'test' | 'live' {
  const match = /^(?:sk|rk)_(test|live)_/.exec(key)
  if (!match) throw new Error('Not a Stripe secret key')
  return match[1] as 'test' | 'live'
}

/** The id of the payment of a session, whether Stripe sent the id or the whole object. */
function paymentIdOf(paymentIntent: string | { id: string } | null): string {
  const id = typeof paymentIntent === 'string' ? paymentIntent : paymentIntent?.id
  if (!id) throw new Error('A paid Stripe session without a payment')
  return id
}

export class StripeGateway implements PaymentGateway {
  readonly name = 'stripe'

  constructor(private readonly stripe: Stripe, private readonly now: () => Date = () => new Date()) {}

  async createSession(input: CreateSessionInput): Promise<CheckoutSession> {
    const earliest = this.now().getTime() + MIN_SESSION_MINUTES * 60_000
    const expiresAt = Math.floor(Math.max(input.expiresAt.getTime(), earliest) / 1000)
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      allowed_payment_method_types: ['card'],
      submit_type: 'book',
      line_items: input.lines.map((line) => ({
        quantity: 1,
        price_data: { currency: 'eur', unit_amount: line.amountCents, product_data: { name: line.label } },
      })),
      client_reference_id: input.bookingId,
      metadata: { booking_id: input.bookingId },
      customer_email: input.customerEmail,
      locale: LOCALES.has(input.language) ? (input.language as 'it' | 'en' | 'de') : 'auto',
      expires_at: expiresAt,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    }, {
      // The same booking asking twice (a double click, a retry) gets the same session back, not a second one to pay.
      idempotencyKey: `checkout-${input.bookingKey}`,
    })
    if (!session.url) throw new Error('Stripe opened a session without an address to pay at')
    return { id: session.id, url: session.url }
  }

  async getSession(sessionId: string): Promise<SessionState> {
    const session = await this.stripe.checkout.sessions.retrieve(sessionId)
    if (session.status === 'open') {
      if (!session.url) throw new Error('An open Stripe session without an address to pay at')
      return { status: 'open', url: session.url }
    }
    if (session.status === 'expired') return { status: 'expired' }
    // Complete. With cards the money is there; anything else is not a case to guess about: stop, and let a person look.
    if (session.status === 'complete' && session.payment_status === 'paid') {
      return { status: 'paid', paymentRef: paymentIdOf(session.payment_intent) }
    }
    throw new Error(`Unexpected Stripe session state: ${session.status} / ${session.payment_status}`)
  }

  async expireSession(sessionId: string): Promise<ExpireResult> {
    try {
      await this.stripe.checkout.sessions.expire(sessionId)
      return 'expired'
    } catch (error) {
      // A refusal is the answer "it cannot be closed": that is true when it is already paid or already closed. Anything else (a dropped
      // connection, a server error) says nothing about the session, so it is thrown, and the caller does not free the bikes.
      if (!(error instanceof Stripe.errors.StripeInvalidRequestError)) throw error
      const session = await this.stripe.checkout.sessions.retrieve(sessionId)
      if (session.status === 'open') throw error
      return 'not_open'
    }
  }

  async refund(request: RefundRequest): Promise<RefundResult> {
    try {
      const refund = await this.stripe.refunds.create({
        payment_intent: request.paymentRef,
        amount: request.amountCents,
        metadata: { reservation_id: request.reservationId, attempt: String(request.attempt) },
      }, {
        // The reservation AND the attempt: the same request twice is the same refund; a retry after a failure is a different one.
        idempotencyKey: `refund-${request.reservationId}-${request.attempt}`,
      })
      if (refund.status === 'failed' || refund.status === 'canceled') return { status: 'failed', reason: refund.failure_reason ?? refund.status }
      return { status: refund.status === 'succeeded' ? 'succeeded' : 'pending', refundRef: refund.id }
    } catch (error) {
      // Stripe refused the request, so there is no refund: the code alone is kept (the message may name the payment).
      if (error instanceof Stripe.errors.StripeInvalidRequestError) return { status: 'failed', reason: error.code ?? 'invalid_request' }
      // Anything else leaves it unknown whether the refund exists: throw, so the row stays pending and is asked again with the same key.
      throw error
    }
  }
}
