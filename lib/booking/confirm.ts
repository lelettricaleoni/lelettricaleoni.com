import { confirmHold, findBooking } from './holds'
import { settleLatePayment } from './late-payment'
import { getPaymentGateway } from './payments'
import type { PaymentGateway } from './payments/gateway'

export type ConfirmResult =
  | { status: 'confirmed' | 'already_confirmed' | 'not_paid' | 'incomplete' | 'reassigned' | 'refunded'; bookingId: string }
  | { status: 'closed'; bookingId: string; bookingStatus: string }
  | { status: 'refund_failed'; bookingId: string }
  | { status: 'unknown_booking' }

/**
 * Turns a PAID session into a confirmed booking. Safe to call many times, and at the same time (the webhook, the page the customer
 * lands on, the sweeper may all arrive together): the gateway is asked what was paid, and the booking and its bikes move together in
 * ONE statement, so exactly one call confirms and the others find it done.
 *
 * `incomplete`: the booking is pending but does not hold all its bikes (should not happen: the session is made after the last bike);
 * nothing is confirmed. A payment for a booking whose bikes were already freed is the late-payment case (./late-payment.ts).
 */
export async function confirmBooking(bookingId: string, gateway: PaymentGateway = getPaymentGateway()): Promise<ConfirmResult> {
  const booking = await findBooking(bookingId)
  if (!booking) return { status: 'unknown_booking' }
  if (booking.status === 'confirmed') return { status: 'already_confirmed', bookingId }
  if (!booking.stripeSessionId) return { status: 'not_paid', bookingId }

  const session = await gateway.getSession(booking.stripeSessionId)
  if (session.status !== 'paid') return { status: 'not_paid', bookingId }

  if (booking.status === 'pending') {
    const done = await confirmHold(bookingId, session.paymentRef)
    if (done.confirmed) return { status: 'confirmed', bookingId }
    const again = await findBooking(bookingId)
    if (again?.status === 'confirmed') return { status: 'already_confirmed', bookingId }
    if (again?.status === 'pending') return { status: 'incomplete', bookingId }
    if (again?.status !== 'expired') return { status: 'closed', bookingId, bookingStatus: again?.status ?? 'unknown' }
    return settleLatePayment(bookingId, session.paymentRef, gateway)
  }
  // `failed_refunded`: claimed for the refund already; asking again finishes the refunds that did not go through.
  if (booking.status === 'expired' || booking.status === 'failed_refunded') return settleLatePayment(bookingId, session.paymentRef, gateway)
  return { status: 'closed', bookingId, bookingStatus: booking.status }
}
