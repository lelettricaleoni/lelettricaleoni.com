import { and, eq, isNull, ne, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import type Stripe from 'stripe'
import { db, bookingRefunds, bookings, stripeEvents } from '@/lib/db'
import { confirmBooking } from './confirm'
import { getPaymentGateway } from './payments'
import type { PaymentGateway } from './payments/gateway'
import { settleHold } from './settle'

/*
 * What Stripe tells us on its own, through the webhook (app/api/stripe/webhook/route.ts verifies the signature; this file is what is done
 * with a genuine event). Stripe may send an event twice, late, or in another order, so everything here is safe to repeat:
 * confirming and settling are written for that (3b), and an event whose work was finished is not worked on again.
 *
 * The events the endpoint must be set to receive (the Stripe dashboard): checkout.session.completed, checkout.session.expired,
 * refund.created, refund.updated, refund.failed.
 */

export type StripeEventResult =
  | { status: 'duplicate' }
  | { status: 'ignored' }
  | { status: 'handled'; /** Set when this event is what confirmed a booking: the shop's calendar must hear of it. */ confirmedBookingId?: string }

/** Writes the event down. `done`: its work was finished before, so it is not worked on again. `new` and `unfinished` are worked on. */
async function recordEvent(event: Stripe.Event): Promise<'new' | 'unfinished' | 'done'> {
  const inserted = await db.insert(stripeEvents).values({ id: event.id, type: event.type }).onConflictDoNothing().returning({ id: stripeEvents.id })
  if (inserted.length > 0) return 'new'
  const [seen] = await db.select({ processedAt: stripeEvents.processedAt }).from(stripeEvents).where(eq(stripeEvents.id, event.id))
  return seen?.processedAt ? 'done' : 'unfinished'
}

export async function processStripeEvent(event: Stripe.Event, gateway?: PaymentGateway): Promise<StripeEventResult> {
  if ((await recordEvent(event)) === 'done') return { status: 'duplicate' }
  const payments = gateway ?? getPaymentGateway()
  const result = await dispatch(event, payments)
  await db.update(stripeEvents).set({ processedAt: sql`now()` }).where(eq(stripeEvents.id, event.id))
  return result
}

async function dispatch(event: Stripe.Event, gateway: PaymentGateway): Promise<StripeEventResult> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const booking = await bookingOfSession(event.data.object.id)
      if (!booking) return unknown('checkout session', event)
      // The session is read again from Stripe (confirmBooking asks the gateway): the event says "something happened", Stripe says what.
      const confirmed = await confirmBooking(booking.id, gateway)
      return confirmed.status === 'confirmed' ? { status: 'handled', confirmedBookingId: booking.id } : { status: 'handled' }
    }
    case 'checkout.session.expired': {
      const booking = await bookingOfSession(event.data.object.id)
      if (!booking) return unknown('checkout session', event)
      // Not "free the bikes": settleHold checks with Stripe that the session cannot be paid, and confirms if it was paid after all.
      await settleHold(booking.id, gateway)
      return { status: 'handled' }
    }
    case 'refund.created':
    case 'refund.updated':
    case 'refund.failed':
      return alignRefund(event.data.object, event)
    default:
      return { status: 'ignored' }
  }
}

async function bookingOfSession(sessionId: string) {
  const [booking] = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.stripeSessionId, sessionId))
  return booking
}

/** A session or refund that is not ours (or not yet written down: the first answer to a request may come after its event). Ids only in the log. */
function unknown(what: string, event: Stripe.Event): StripeEventResult {
  console.warn('[stripe] event about something we do not know', { event: event.id, type: event.type, what })
  return { status: 'handled' }
}

const reservationIdSchema = z.uuid()

/**
 * Brings the row of a refund in line with what Stripe says about it. The row is found by the refund's id, or, when our own answer has
 * not been written yet, by the reservation written in its metadata. A refund made by hand in the Stripe dashboard has neither: it is
 * logged and left alone (the money moved without a bike being cancelled; that is for a person to settle).
 */
async function alignRefund(refund: Stripe.Refund, event: Stripe.Event): Promise<StripeEventResult> {
  const reservationId = reservationIdSchema.safeParse(refund.metadata?.reservation_id)
  const [row] = await db.select().from(bookingRefunds).where(or(
    eq(bookingRefunds.gatewayRefundId, refund.id),
    reservationId.success ? eq(bookingRefunds.reservationId, reservationId.data) : undefined,
  ))
  if (!row) return unknown('refund', event)

  if (refund.status === 'succeeded') {
    // The money moved: written whatever the row said before (a failure we had recorded was for another attempt, or a wrong guess).
    await db.update(bookingRefunds).set({ status: 'succeeded', gatewayRefundId: refund.id })
      .where(and(eq(bookingRefunds.id, row.id), ne(bookingRefunds.status, 'succeeded')))
  } else if (refund.status === 'failed' || refund.status === 'canceled') {
    // Only for the request that is still the current one: an older attempt failing later says nothing about the newer one.
    const attempt = Number(refund.metadata?.attempt)
    if (attempt === row.attempts) {
      const failed = await db.update(bookingRefunds).set({ status: 'failed' })
        .where(and(eq(bookingRefunds.id, row.id), eq(bookingRefunds.status, 'pending'), or(isNull(bookingRefunds.gatewayRefundId), eq(bookingRefunds.gatewayRefundId, refund.id))))
        .returning({ id: bookingRefunds.id })
      if (failed.length > 0) {
        // Nobody is told yet (the emails of slice 4 will): the log is what there is. Ids and Stripe's reason code, nothing about the person.
        console.error('[stripe] a refund failed at Stripe and needs somebody to look at it', {
          bookingId: row.bookingId, reservationId: row.reservationId, reason: refund.failure_reason ?? refund.status,
        })
      }
    }
  } else if (!row.gatewayRefundId) {
    await db.update(bookingRefunds).set({ gatewayRefundId: refund.id }).where(and(eq(bookingRefunds.id, row.id), isNull(bookingRefunds.gatewayRefundId)))
  }
  return { status: 'handled' }
}
