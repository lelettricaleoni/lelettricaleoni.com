import { after } from 'next/server'
import { handleStripeWebhook } from '@/lib/booking/stripe-webhook'
import { syncBookingLines } from '@/lib/booking/calendar-sync'

// Called by Stripe, never by our own frontend: the one case for a route handler in the payment path. It reads the body as it arrived
// (the signature is over those exact bytes), so it runs per request.

export async function POST(request: Request) {
  const rawBody = await request.text()
  const { status, body, confirmedBookingId } = await handleStripeWebhook(
    rawBody, request.headers.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET,
  )
  // The shop's calendar hears of a confirmed booking after the answer is out (docs: after() runs once the response is finished).
  if (confirmedBookingId) after(() => syncBookingLines(confirmedBookingId))
  return Response.json(body, { status })
}
