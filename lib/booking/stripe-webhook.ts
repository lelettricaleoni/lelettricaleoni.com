import 'server-only'
import Stripe from 'stripe'
import { safeErrorSummary } from '@/lib/safe-error'
import { processStripeEvent, type StripeEventResult } from './stripe-events'

export interface WebhookResponse {
  status: number
  body: Record<string, unknown>
  /** Set when this call confirmed a booking: the route sends it to the shop's calendar once the answer is out. */
  confirmedBookingId?: string
}

/**
 * What Stripe's call to POST /api/stripe/webhook gets as an answer. The signature is checked on the body exactly as it arrived (a
 * re-serialised body would not match), with the secret of the endpoint; nothing is worked on before that. Stripe tries again on
 * anything but a 2xx, so a failure of ours is a 500 and a call that cannot be genuine is a 400 that is not worth retrying.
 */
export async function handleStripeWebhook(
  rawBody: string,
  signature: string | null,
  secret: string | undefined,
  work: (event: Stripe.Event) => Promise<StripeEventResult> = processStripeEvent,
): Promise<WebhookResponse> {
  if (!secret) return { status: 503, body: { error: 'Webhook not configured' } }
  if (!signature) return { status: 400, body: { error: 'Missing signature' } }

  let event: Stripe.Event
  try {
    event = Stripe.webhooks.constructEvent(rawBody, signature, secret)
  } catch {
    return { status: 400, body: { error: 'Invalid signature' } }
  }

  try {
    const result = await work(event)
    return {
      status: 200,
      body: { received: true, ...(result.status === 'duplicate' ? { duplicate: true } : {}) },
      ...(result.status === 'handled' && result.confirmedBookingId ? { confirmedBookingId: result.confirmedBookingId } : {}),
    }
  } catch (error) {
    console.error('[stripe] could not work on an event', { event: event.id, type: event.type, error: safeErrorSummary(error) })
    return { status: 500, body: { error: 'Could not process the event' } }
  }
}
