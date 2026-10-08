import { and, eq } from 'drizzle-orm'
import { db, bikeReservations, bikeUnits, bookingRefunds, bookings, type Booking } from '@/lib/db'
import { safeErrorSummary } from '@/lib/safe-error'
import type { ConfirmResult } from './confirm'
import { confirmHold, expireBooking, findBooking, holdOneBike, reviveBooking } from './holds'
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
 *  1. Unless a refund of this booking has already begun (then the money goes back, whatever has become free since): bring the booking
 *     back to pending and hold again a bike of the same model, size and version for each original line; if all are held, confirm.
 *  2. Otherwise (or if any line finds nobody free, or the customer already has another payment on its way): free what was held again
 *     and refund every original line in full; the booking becomes `failed_refunded`.
 */
export async function settleLatePayment(bookingId: string, paymentRef: string, gateway: PaymentGateway): Promise<ConfirmResult> {
  const booking = await findBooking(bookingId)
  if (!booking) return { status: 'unknown_booking' }
  if (booking.status !== 'expired') return { status: 'closed', bookingId, bookingStatus: booking.status }

  const original = await originalLines(bookingId)
  if (!(await refundBegan(bookingId)) && (await reviveBooking(bookingId))) {
    if (await holdAgain(booking, original)) {
      const done = await confirmHold(bookingId, paymentRef)
      if (done.confirmed) return { status: 'reassigned', bookingId }
    }
    await expireBooking(bookingId) // frees whatever was held again
  }
  return refundEverything(booking, original, paymentRef, gateway)
}

async function originalLines(bookingId: string): Promise<OriginalLine[]> {
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
    .where(and(eq(bikeReservations.bookingId, bookingId), eq(bikeReservations.status, 'expired')))
  return rows.map((row) => ({ ...row, amountCents: row.amountCents ?? 0 }))
}

async function refundBegan(bookingId: string): Promise<boolean> {
  const rows = await db.select({ id: bookingRefunds.id }).from(bookingRefunds)
    .where(and(eq(bookingRefunds.bookingId, bookingId), eq(bookingRefunds.reason, 'late_payment'))).limit(1)
  return rows.length > 0
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
  await db.update(bookings).set({ status: 'failed_refunded' }).where(and(eq(bookings.id, booking.id), eq(bookings.status, 'expired')))
  // Kevin is told by email from slice 4; until then this line is what there is to find.
  console.error('[booking] late payment: refunded in full, the bikes were no longer free', { bookingId: booking.id })
  return { status: 'refunded', bookingId: booking.id }
}
