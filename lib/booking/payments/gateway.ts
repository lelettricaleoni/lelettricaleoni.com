/*
 * The seam between a booking and the money. Everything that decides what a payment MEANS (hold, confirm, settle, refund) is written
 * against this interface; what moves the money is behind it. There are two ways to be behind it: the fake (staging and a laptop,
 * never production: ./index.ts) and Stripe (slice 3d).
 */

export interface CheckoutLine {
  /** What the person sees for this bike on the payment page. */
  label: string
  amountCents: number
}

export interface CreateSessionInput {
  bookingId: string
  /** The idempotency key of the whole booking: asking twice with it must give the same session. */
  bookingKey: string
  customerEmail: string
  language: string
  lines: CheckoutLine[]
  /** When the held bikes are given up. A real gateway may keep the session open longer; settleHold closes it. */
  expiresAt: Date
  successUrl: string
  cancelUrl: string
}

export interface CheckoutSession {
  id: string
  /** Where to send the person to pay. */
  url: string
}

export type SessionState =
  | { status: 'open'; url: string }
  | { status: 'paid'; /** The reference of the payment, kept to refund it. */ paymentRef: string }
  | { status: 'expired' }

/** `not_open`: it was already paid or already expired, so nothing was closed: read it again to see which. */
export type ExpireResult = 'expired' | 'not_open'

export interface RefundRequest {
  /** One refund per reservation. */
  reservationId: string
  /**
   * 1 for the first request; a failed refund is asked again as attempt 2, 3... The gateway's idempotency key is the reservation AND the
   * attempt: the same request twice gets the same answer (Stripe keeps it for a day, an error included), so a retry after a failure
   * must be a different request, and the database row, not the gateway, is what stops a bike being refunded twice.
   */
  attempt: number
  paymentRef: string
  amountCents: number
}

export type RefundResult =
  | { status: 'succeeded' | 'pending'; refundRef: string }
  | { status: 'failed'; reason: string }

export interface PaymentGateway {
  readonly name: 'fake' | 'stripe'
  createSession(input: CreateSessionInput): Promise<CheckoutSession>
  getSession(sessionId: string): Promise<SessionState>
  /** Closes an OPEN session so it can no longer be paid. */
  expireSession(sessionId: string): Promise<ExpireResult>
  refund(request: RefundRequest): Promise<RefundResult>
}
