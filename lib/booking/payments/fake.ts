import type {
  CheckoutSession, CreateSessionInput, ExpireResult, PaymentGateway, RefundRequest, RefundResult, SessionState,
} from './gateway'

/*
 * A payment gateway that moves no money: for building and trying the whole booking path on staging and a laptop. It must never be
 * reachable in production (./index.ts refuses, and fake-guard.test.ts checks nobody else imports this file).
 *
 * Sessions live in the memory of the process: a restart forgets them, which on staging only means an unfinished test payment reads
 * as expired. `pay()` is what the staging payment page calls instead of a card.
 */

interface FakeSession {
  id: string
  input: CreateSessionInput
  state: 'open' | 'paid' | 'expired'
}

const shared = globalThis as unknown as { __fakeSessions?: Map<string, FakeSession>; __fakeRefunds?: Map<string, RefundResult> }

export class FakeGateway implements PaymentGateway {
  readonly name = 'fake' as const
  /** Test hook: the next refund fails once. */
  failNextRefund = false

  constructor(
    private readonly sessions: Map<string, FakeSession> = (shared.__fakeSessions ??= new Map()),
    private readonly refunds: Map<string, RefundResult> = (shared.__fakeRefunds ??= new Map()),
  ) {}

  private stateOf(session: FakeSession): FakeSession['state'] {
    return session.state === 'open' && session.input.expiresAt.getTime() <= Date.now() ? 'expired' : session.state
  }

  private urlOf(id: string, language: string): string {
    return `/${language}/rent/fake-checkout/${id}`
  }

  async createSession(input: CreateSessionInput): Promise<CheckoutSession> {
    const id = `fake_cs_${crypto.randomUUID()}`
    this.sessions.set(id, { id, input, state: 'open' })
    return { id, url: this.urlOf(id, input.language) }
  }

  async getSession(sessionId: string): Promise<SessionState> {
    const session = this.sessions.get(sessionId)
    if (!session) return { status: 'expired' }
    const state = this.stateOf(session)
    if (state === 'paid') return { status: 'paid', paymentRef: `fake_pi_${session.id}` }
    if (state === 'expired') return { status: 'expired' }
    return { status: 'open', url: this.urlOf(session.id, session.input.language) }
  }

  async expireSession(sessionId: string): Promise<ExpireResult> {
    const session = this.sessions.get(sessionId)
    if (!session || this.stateOf(session) !== 'open') return 'not_open'
    session.state = 'expired'
    return 'expired'
  }

  /** What the staging payment page does instead of a card. False when the session cannot be paid any more. */
  pay(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session || this.stateOf(session) !== 'open') return false
    session.state = 'paid'
    return true
  }

  /** Like Stripe: the same reservation and attempt gets the same answer for ever, a failure too; a new attempt is a new request. */
  async refund(request: RefundRequest): Promise<RefundResult> {
    const key = `${request.reservationId}:${request.attempt}`
    const done = this.refunds.get(key)
    if (done) return done
    let result: RefundResult = { status: 'succeeded', refundRef: `fake_re_${request.reservationId}_${request.attempt}` }
    if (this.failNextRefund) {
      this.failNextRefund = false
      result = { status: 'failed', reason: 'fake refund failure' }
    }
    this.refunds.set(key, result)
    return result
  }

  /** What the staging payment page shows about a session, or null when there is none. */
  describe(sessionId: string): { lines: CreateSessionInput['lines']; successUrl: string; cancelUrl: string; bookingId: string } | null {
    const session = this.sessions.get(sessionId)
    if (!session) return null
    const { lines, successUrl, cancelUrl, bookingId } = session.input
    return { lines, successUrl, cancelUrl, bookingId }
  }

  sessionCount(): number {
    return this.sessions.size
  }

  /** The refunds that were made (the failed ones are not). */
  refundCount(): number {
    return [...this.refunds.values()].filter((result) => result.status !== 'failed').length
  }

  /** The sessions that can still be paid. */
  openSessionCount(): number {
    return [...this.sessions.values()].filter((session) => this.stateOf(session) === 'open').length
  }
}
