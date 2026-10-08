import type { ConfirmResult } from './confirm'
import type { PaymentGateway } from './payments/gateway'

// Placeholder for Task 6 only: Task 7 replaces the whole file (its test comes first).
export async function settleLatePayment(bookingId: string, _paymentRef: string, _gateway: PaymentGateway): Promise<ConfirmResult> {
  throw new Error(`late payment of ${bookingId}: not written yet (Task 7)`)
}
