import { and, eq, sql } from 'drizzle-orm'
import { db, bikeReservations, bookingRefunds, bookings } from '@/lib/db'
import { getPaymentGateway } from './payments'
import type { PaymentGateway } from './payments/gateway'
import { isRefundable, refundDeadline } from './refund-deadline'

export type RefundReason = 'customer' | 'staff' | 'late_payment'

export interface IssueRefundInput {
  reservationId: string
  bookingId: string
  amountCents: number
  paymentRef: string
  reason: RefundReason
  /** The signed-in user who asked; null for what the system does by itself. */
  createdBy: string | null
}

export type IssuedRefund =
  | { status: 'succeeded' | 'pending'; refundRef: string }
  | { status: 'failed'; reason: string }

/**
 * Gives back the money of ONE bike, in this order, so that a crash anywhere leaves something a second call can finish:
 *  1. the refund is written down as `pending` (one row per bike: the unique key makes a second refund impossible), in the same
 *     statement that checks (a) the bike is still in the state a refund is due from (`confirmed` for a cancellation, `expired` for
 *     a payment that came after the bikes were freed), (b) the amount is not more than that bike cost, and (c) the refunds of the
 *     booking will not add up to more than it was paid;
 *  2. the gateway is asked, with the reservation as its idempotency key (a repeated request gets the same refund);
 *  3. the row is updated with the answer.
 * A refund that already succeeded is returned as it is; one that failed or stayed pending is asked again, for the amount first written.
 */
export async function issueRefund(input: IssueRefundInput, gateway: PaymentGateway): Promise<IssuedRefund> {
  const dueFrom = input.reason === 'late_payment' ? 'expired' : 'confirmed'
  const inserted = await db.execute<{ id: string }>(sql`
    insert into booking_refunds (reservation_id, booking_id, amount_cents, reason, created_by)
    select ${input.reservationId}::uuid, b.id, ${input.amountCents}::int, ${input.reason}::refund_reason, ${input.createdBy}::uuid
    from bookings b
    join bike_reservations r on r.id = ${input.reservationId}::uuid and r.booking_id = b.id
    where b.id = ${input.bookingId}::uuid
      and r.status = ${dueFrom}::reservation_status
      and ${input.amountCents}::int <= coalesce(r.amount_cents, 0)
      and ${input.amountCents}::int
        + coalesce((select sum(f.amount_cents) from booking_refunds f where f.booking_id = b.id and f.status <> 'failed'), 0)
        <= b.total_cents
    on conflict (reservation_id) do nothing
    returning id`)

  let amountCents = input.amountCents
  if (inserted.length === 0) {
    const [existing] = await db.select().from(bookingRefunds).where(eq(bookingRefunds.reservationId, input.reservationId))
    if (!existing) {
      // Refused by the statement: say which rule (the bike is not refundable any more, or the booking would be over-refunded).
      const [bike] = await db.select({ status: bikeReservations.status, amountCents: bikeReservations.amountCents })
        .from(bikeReservations).where(eq(bikeReservations.id, input.reservationId))
      const refundable = bike && bike.status === dueFrom && input.amountCents <= (bike.amountCents ?? 0)
      return { status: 'failed', reason: refundable ? 'over_total' : 'not_refundable' }
    }
    if (existing.status === 'succeeded' && existing.gatewayRefundId) return { status: 'succeeded', refundRef: existing.gatewayRefundId }
    amountCents = existing.amountCents
    await db.update(bookingRefunds).set({ status: 'pending' })
      .where(and(eq(bookingRefunds.reservationId, input.reservationId), eq(bookingRefunds.status, 'failed')))
  }

  const result = await gateway.refund({ reservationId: input.reservationId, paymentRef: input.paymentRef, amountCents })
  if (result.status === 'failed') {
    await db.update(bookingRefunds).set({ status: 'failed' }).where(eq(bookingRefunds.reservationId, input.reservationId))
    return result
  }
  await db.update(bookingRefunds).set({ status: result.status, gatewayRefundId: result.refundRef })
    .where(eq(bookingRefunds.reservationId, input.reservationId))
  return result
}

export type CancelActor =
  | { kind: 'customer'; customerId: string; userId: string }
  | { kind: 'staff'; userId: string }

export interface CancelOnlineInput {
  reservationId: string
  actor: CancelActor
  /** Staff only: how much to give back (default: all of it; 0 = nothing). The customer always gets all of it, before the deadline. */
  refundCents?: number
  now?: Date
}

export type CancelOnlineResult =
  | { status: 'cancelled'; refundedCents: number; bookingCancelled: boolean; refund: 'none' | 'succeeded' | 'pending' }
  | { status: 'already_cancelled' }
  | { status: 'not_found' }
  | { status: 'too_late'; deadline: Date }
  | { status: 'invalid_amount' }
  | { status: 'refund_failed'; reason: string }

/**
 * Cancels ONE online bike and gives back what is due. The customer can do it for their own bikes until the refund deadline; the
 * staff at any time and for any amount. If the gateway refuses, the bike stays confirmed and the refund stays `failed`, ready to be
 * tried again; if the database fails after the gateway refunded, a second call finds the refund and finishes the cancellation.
 * The booking is cancelled together with its last bike, in the same statement.
 */
export async function cancelOnlineReservation(
  input: CancelOnlineInput, gateway: PaymentGateway = getPaymentGateway(),
): Promise<CancelOnlineResult> {
  const [row] = await db
    .select({
      id: bikeReservations.id,
      status: bikeReservations.status,
      customerId: bikeReservations.customerId,
      amountCents: bikeReservations.amountCents,
      startsOn: bikeReservations.startsOn,
      bookingId: bikeReservations.bookingId,
      paymentRef: bookings.stripePaymentIntentId,
    })
    .from(bikeReservations)
    .innerJoin(bookings, eq(bookings.id, bikeReservations.bookingId))
    .where(and(eq(bikeReservations.id, input.reservationId), eq(bikeReservations.kind, 'online_rental')))
  if (!row || !row.bookingId) return { status: 'not_found' }
  // A customer only ever sees their own bikes.
  if (input.actor.kind === 'customer' && row.customerId !== input.actor.customerId) return { status: 'not_found' }
  if (row.status === 'cancelled') return { status: 'already_cancelled' }
  if (row.status !== 'confirmed') return { status: 'not_found' }

  const price = row.amountCents ?? 0
  let refundCents: number
  if (input.actor.kind === 'customer') {
    if (!isRefundable(row.startsOn, input.now)) return { status: 'too_late', deadline: refundDeadline(row.startsOn) }
    refundCents = price
  } else {
    refundCents = input.refundCents ?? price
    if (!Number.isInteger(refundCents) || refundCents < 0 || refundCents > price) return { status: 'invalid_amount' }
  }

  let refund: 'none' | 'succeeded' | 'pending' = 'none'
  if (refundCents > 0) {
    if (!row.paymentRef) return { status: 'refund_failed', reason: 'no_payment' }
    const issued = await issueRefund({
      reservationId: row.id,
      bookingId: row.bookingId,
      amountCents: refundCents,
      paymentRef: row.paymentRef,
      reason: input.actor.kind === 'customer' ? 'customer' : 'staff',
      createdBy: input.actor.userId,
    }, gateway)
    if (issued.status === 'failed') return { status: 'refund_failed', reason: issued.reason }
    refund = issued.status
  }

  const [done] = await db.execute<{ lines: number; bookings: number }>(sql`
    with l as (
      update bike_reservations set status = 'cancelled'
      where id = ${row.id}::uuid and status = 'confirmed'
      returning booking_id
    ), b as (
      update bookings set status = 'cancelled'
      where id in (select booking_id from l)
        and not exists (select 1 from bike_reservations x where x.booking_id = bookings.id and x.status = 'confirmed' and x.id <> ${row.id}::uuid)
      returning id
    )
    select (select count(*) from l)::int as lines, (select count(*) from b)::int as bookings`)
  if (done.lines === 0) return { status: 'already_cancelled' }
  return { status: 'cancelled', refundedCents: refundCents, bookingCancelled: done.bookings > 0, refund }
}
