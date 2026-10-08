import { isProduction } from '@/lib/app-env'
import { FakeGateway } from './fake'
import type { PaymentGateway } from './gateway'

export type { PaymentGateway } from './gateway'
export { FakeGateway } from './fake'

export class PaymentsNotConfiguredError extends Error {
  constructor() {
    super('Online payments are not configured in this environment')
    this.name = 'PaymentsNotConfiguredError'
  }
}

let fake: FakeGateway | undefined

/**
 * The gateway of this environment. Production gets one only when Stripe is configured (slice 3d adds that branch, BEFORE the
 * fallback below); until then production refuses, so nothing can be booked there without a real payment.
 * The fake is for staging and a laptop, and this file is the only one allowed to import it.
 */
export function getPaymentGateway(): PaymentGateway {
  if (isProduction()) throw new PaymentsNotConfiguredError()
  return (fake ??= new FakeGateway())
}

/** Whether the booking path can be offered here at all. */
export function paymentsAvailable(): boolean {
  try {
    getPaymentGateway()
    return true
  } catch (error) {
    if (error instanceof PaymentsNotConfiguredError) return false
    throw error
  }
}

/** The fake, for the staging payment page that stands in for the card form; throws wherever the fake is not what pays. */
export function getFakeGateway(): FakeGateway {
  const gateway = getPaymentGateway()
  if (!(gateway instanceof FakeGateway)) throw new PaymentsNotConfiguredError()
  return gateway
}
