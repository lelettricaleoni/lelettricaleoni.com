import { and, asc, eq } from 'drizzle-orm'
import { db, bikeReservations, bikeUnits, type Booking } from '@/lib/db'
import { safeErrorSummary } from '@/lib/safe-error'
import type { ConfirmResult } from './confirm'
import { claimForRefund, confirmHold, findBooking, holdOneBike, reviveBooking } from './holds'
import type { PaymentGateway } from './payments/gateway'
import { issueRefund } from './refunds'

interface OriginalLine {
  id: string
  amountCents: number
  bikeModelId: string
  bikeSizeId: string
  bikeVersionId: string
}

/**
 * The money of a booking arrived although its bikes had been freed. It should not happen: a held bike is only freed once the gateway
 * says its session can no longer be paid (settleHold). This is the net for what we did not foresee, and the rule is: never keep money
 * without a bike.
 *  1. Only ONE caller may bring the booking back (`reviveBooking` is a compare-and-set on `expired`): it holds again a bike of the same
 *     model, size and version for each original line, and if all are held, confirms. A caller that lost that race does nothing: the
 *     other one is deciding between the bikes and the money, and doing both would give the person both.
 *  2. If the bikes cannot come back (a line finds nobody free, or the customer already has another payment on its way) the booking is
 *     CLAIMED for the refund (`failed_refunded`, in one statement that also frees what was held again) BEFORE any money moves: from that
 *     moment nobody can sell the bikes again. Then every original line is refunded in full; asking again finishes what did not go through.
 */
export async function settleLatePayment(bookingId: string, paymentRef: string, gateway: PaymentGateway): Promise<ConfirmResult> {
  const booking = await findBooking(bookingId)
  if (!booking) return { status: 'unknown_booking' }
  if (booking.status === 'failed_refunded') return refundEverything(booking, await originalLines(booking), paymentRef, gateway)
  if (booking.status !== 'expired') return { status: 'closed', bookingId, bookingStatus: booking.status }

  const original = await originalLines(booking)
  const revived = await reviveBooking(bookingId)
  if (revived === 'taken') return { status: 'incomplete', bookingId } // somebody else is settling it
  if (revived === 'revived' && (await holdAgain(booking, original))) {
    const done = await confirmHold(bookingId, paymentRef)
    if (done.confirmed) return { status: 'reassigned', bookingId }
  }
  if (!(await claimForRefund(bookingId))) return { status: 'incomplete', bookingId }
  return refundEverything(booking, original, paymentRef, gateway)
}

/** The bikes first held for the booking: the first `lineCount` lines made, so a bike held again for a moment is never counted. */
async function originalLines(booking: Booking): Promise<OriginalLine[]> {
  const rows = await db
    .select({
      id: bikeReservations.id,
      amountCents: bikeReservations.amountCents,
      bikeModelId: bikeUnits.bikeModelId,
      bikeSizeId: bikeUnits.bikeSizeId,
      bikeVersionId: bikeUnits.bikeVersionId,
    })
    .from(bikeReservations)
    .innerJoin(bikeUnits, eq(bikeUnits.id, bikeReservations.bikeUnitId))
    .where(and(eq(bikeReservations.bookingId, booking.id), eq(bikeReservations.status, 'expired')))
    .orderBy(asc(bikeReservations.createdAt), asc(bikeReservations.id))
    .limit(booking.lineCount)
  return rows.map((row) => ({ ...row, amountCents: row.amountCents ?? 0 }))
}

async function holdAgain(booking: Booking, original: OriginalLine[]): Promise<boolean> {
  const context = {
    bookingKey: booking.requestKey, customerId: booking.customerId, startsOn: booking.startsOn, endsOn: booking.endsOn,
    language: booking.language, lines: [],
  }
  for (const line of original) {
    const outcome = await holdOneBike(booking.id, context, {
      bikeModelId: line.bikeModelId, bikeSizeId: line.bikeSizeId, bikeVersionId: line.bikeVersionId, amountCents: line.amountCents,
    })
    if (outcome !== 'held') return false
  }
  return true
}

async function refundEverything(booking: Booking, original: OriginalLine[], paymentRef: string, gateway: PaymentGateway): Promise<ConfirmResult> {
  let allDone = true
  for (const line of original) {
    if (line.amountCents <= 0) continue
    try {
      const issued = await issueRefund({
        reservationId: line.id, bookingId: booking.id, amountCents: line.amountCents, paymentRef, reason: 'late_payment', createdBy: null,
      }, gateway)
      if (issued.status === 'failed') allDone = false
    } catch (error) {
      allDone = false
      console.error('[booking] late payment: a refund could not be asked', { bookingId: booking.id, error: safeErrorSummary(error) })
    }
  }
  if (!allDone) {
    console.error('[booking] late payment: not every refund went through; it will be asked again', { bookingId: booking.id })
    return { status: 'refund_failed', bookingId: booking.id }
  }
  // Kevin is told by email from slice 4; until then this line is what there is to find.
  console.error('[booking] late payment: refunded in full, the bikes were no longer free', { bookingId: booking.id })
  return { status: 'refunded', bookingId: booking.id }
}
