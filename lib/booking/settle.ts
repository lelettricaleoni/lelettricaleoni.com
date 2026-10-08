import { safeErrorSummary } from '@/lib/safe-error'
import { confirmBooking } from './confirm'
import { expireBooking, findBooking, findOverduePending } from './holds'
import { getPaymentGateway } from './payments'
import type { PaymentGateway } from './payments/gateway'

export type SettleResult = 'expired' | 'confirmed' | 'closed' | 'still_open'

/**
 * Ends the wait of a pending booking WITHOUT ever selling a bike that was paid. The rule (spec, «Scadere senza mai vendere due volte
 * una bici pagata»): a held bike is freed only after the gateway says its session can no longer be paid. In order:
 *  1. close the session: if that works it was open and unpaid, and now it cannot be paid, so the bikes are freed;
 *  2. if it cannot be closed (already paid or already expired) read it again: paid → confirm; expired → free.
 * It does not look at the clock: the caller decides when (the sweeper when time ran out; a customer who starts another booking, now).
 */
export async function settleHold(bookingId: string, gateway: PaymentGateway = getPaymentGateway()): Promise<SettleResult> {
  const booking = await findBooking(bookingId)
  if (!booking || booking.status !== 'pending') return 'closed'

  // No session yet: the process stopped between holding the bikes and opening the payment. Nobody can pay it.
  if (!booking.stripeSessionId) {
    await expireBooking(bookingId)
    return 'expired'
  }

  if ((await gateway.expireSession(booking.stripeSessionId)) === 'expired') {
    await expireBooking(bookingId)
    return 'expired'
  }

  const session = await gateway.getSession(booking.stripeSessionId)
  if (session.status === 'paid') {
    const confirmed = await confirmBooking(bookingId, gateway)
    return confirmed.status === 'confirmed' || confirmed.status === 'already_confirmed' ? 'confirmed' : 'closed'
  }
  if (session.status === 'expired') {
    await expireBooking(bookingId)
    return 'expired'
  }
  return 'still_open'
}

/** What the sweeper runs: every pending booking whose time has run out. One that fails is reported and does not stop the others. */
export async function settleOverdueHolds(gateway: PaymentGateway = getPaymentGateway()): Promise<{ settled: number; failed: number }> {
  let settled = 0
  let failed = 0
  for (const { id } of await findOverduePending()) {
    try {
      await settleHold(id, gateway)
      settled++
    } catch (error) {
      failed++
      console.error('[booking] could not settle a hold', { bookingId: id, error: safeErrorSummary(error) })
    }
  }
  return { settled, failed }
}
