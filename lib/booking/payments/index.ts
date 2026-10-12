import Stripe from 'stripe'
import { isProduction } from '@/lib/app-env'
import { FakeGateway } from './fake'
import type { PaymentGateway } from './gateway'
import { StripeGateway, stripeKeyMode } from './stripe'

export type { PaymentGateway } from './gateway'

export class PaymentsNotConfiguredError extends Error {
  constructor() {
    super('Online payments are not configured in this environment')
    this.name = 'PaymentsNotConfiguredError'
  }
}

let fake: FakeGateway | undefined
let stripe: { key: string; gateway: StripeGateway } | undefined
let warnedAboutKey = false

/**
 * Stripe, when this environment has a key that is allowed to be used here: real money only in production, test money everywhere else.
 * A key of the wrong kind (a live key on staging would charge real cards for a test; a test key in production would take bookings
 * that nobody pays) is not used, and says so once in the log: the environment then behaves as if Stripe were not there.
 */
function stripeGateway(): StripeGateway | undefined {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return undefined
  try {
    if (stripeKeyMode(key) === (isProduction() ? 'live' : 'test')) {
      if (stripe?.key !== key) {
        // Every call that creates something carries an idempotency key, so the SDK may try a dropped request again.
        stripe = { key, gateway: new StripeGateway(new Stripe(key, { maxNetworkRetries: 2, timeout: 20_000, appInfo: { name: 'lelettricaleoni.com' } })) }
      }
      return stripe.gateway
    }
  } catch {
    // not a key at all: falls through to the same message
  }
  if (!warnedAboutKey) {
    warnedAboutKey = true
    console.error('[payments] STRIPE_SECRET_KEY is not usable in this environment (a missing or malformed key, or one of the wrong mode); ignoring it')
  }
  return undefined
}

/**
 * The gateway of this environment: Stripe wherever a usable key is set, else (never in production) the fake. Production without Stripe
 * refuses, so nothing can be booked there without a real payment. The fake is for a laptop and for staging until it has a Stripe key,
 * and this file is the only one allowed to import it.
 */
export function getPaymentGateway(): PaymentGateway {
  const real = stripeGateway()
  if (real) return real
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
