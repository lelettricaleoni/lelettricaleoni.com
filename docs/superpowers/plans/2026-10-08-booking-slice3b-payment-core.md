# Fetta 3b — il motore del pagamento, dietro una «porta» (senza pagine, senza Stripe) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tutto ciò che sta fra la prenotazione e il denaro — iniziare un pagamento, confermarlo, farlo scadere senza mai vendere due volte una bici pagata, rimborsare una bici, gestire il pagamento arrivato in ritardo — scritto contro un'interfaccia `PaymentGateway`, provato con una gateway **finta che esiste solo fuori dalla produzione**.

**Architecture:** Una cartella `lib/booking/payments/` con il contratto (`gateway.ts`), la finta (`fake.ts`) e la fabbrica (`index.ts`, che in produzione senza Stripe si rifiuta di dare una gateway). Sopra, funzioni a istruzione unica sul modello di `lib/booking/holds.ts` (il client non ha transazioni: `max_pipeline: 0`): `quoteBikes`, `beginCheckout`, `confirmBooking`, `settleHold`, `issueRefund` / `cancelOnlineReservation`. Niente pagine e niente Server Action: sono la fetta 3c; Stripe vero, il webhook e `stripe_events` sono la 3d.

**Tech Stack:** TypeScript, Drizzle + `postgres.js` (SQL scritto a mano dove serve una CTE), `zod`, `date-fns` + `@date-fns/tz`, `vitest` (unit e `npm run test:db`).

**Spec:** `docs/superpowers/specs/2026-10-07-booking-slice3-online-booking-design.md` (sezioni «Stripe», «Scadere senza mai vendere due volte una bici pagata», «Il pagamento arrivato quando il posto non c'è più», «Annullare e rimborsare», «Rilascio e dipendenze»). Costruisce sulla 3a: `docs/superpowers/plans/2026-10-07-booking-slice3a-holds.md` (`startHold`, `confirmHold`, `expireBooking`, `holdOneBike`, `findOverduePending`, `getFreeBikes`, `cartSchema`, `expandCart`, `checkStay`, `stayPriceCents`).

## Global Constraints

- **Mai un commit su `main` o `staging`**: ramo `feat/booking-3b-payment-core` da `origin/staging`, PR verso `staging`, non unire prima che `verify`, `browser` e `CodeQL` siano verdi **sullo stesso commit** (`headRefOid`), senza attendere attivamente i controlli.
- **Solo `staging`.** Nulla di questa fetta si pubblica in produzione prima che Kevin lo decida, e **mai senza Stripe**: la finta non deve esistere in produzione (Task 1 lo fissa con un test).
- **Un solo statement per ogni passo che deve essere atomico** (il client non regge le transazioni: `db.transaction` fallisce con `UNSAFE_TRANSACTION`, e `lib/db/no-transactions.test.ts` blocca la CI). Più righe che devono concordare = una CTE.
- **Codice, identificatori, commenti in inglese.** Messaggi per l'utente: non in questa fetta (nessuna interfaccia).
- **Nessun dato di persone nei log**: gli errori di query si scrivono con `safeErrorSummary(error)` (`lib/safe-error.ts`), mai con `String(error)`.
- **Soldi in centesimi interi**, mai float; date di calendario come stringhe `YYYY-MM-DD`; «oggi» in `Europe/Rome` (`todayInRome()`).
- **Librerie prima del custom**: `zod`, `date-fns` + `@date-fns/tz` (`TZDate`); nessuna aritmetica sulle date a mano, nessuna regex di validazione.
- **Migrazioni**: `npx drizzle-kit generate` poi `npm run db:migrate` (`DATABASE_DIRECT_URL` del database giusto); **mai `apply_migration`**. Una migrazione che aggiunge un valore a un enum esistente va applicata da sola, qui non serve (un enum nuovo creato nella stessa migrazione della tabella che lo usa è lecito). Si applica **solo allo sviluppo**; produzione al rilascio, e lo decide Kevin.
- **Per la 3d (promemoria che il codice di questa fetta già rispetta):** Stripe vuole una sessione che duri **almeno 30 minuti dalla creazione**, mentre il posto tenuto scade 30 minuti dopo l'*inserimento* della testata, quindi qualche istante *prima*. `PaymentGateway.createSession` riceve `expiresAt = hold_expires_at` e **la gateway di Stripe lo porterà a ≥ 31 minuti**: l'autorità resta il posto tenuto, perché `settleHold` fa scadere la sessione sul lato Stripe alla scadenza del posto.

## Review Focus

Gli ingressi e le condizioni che la spec implica ma che nessun compito «felice» prova; ognuno ha il suo test nel compito indicato.

1. **Due schede dello stesso cliente con due chiavi diverse, insieme** (`beginCheckout`): deve restare **una sola** prenotazione in pagamento, l'altra risponde `closed` o `has_pending`, e le bici tenute sono solo quelle della vincente. *Task 9.*
2. **Pagamento e scadenza che si incontrano** (`settleHold` mentre il cliente paga): se la sessione risulta pagata non si libera nulla e si conferma; non esiste una finestra in cui una bici pagata torna libera. *Task 8.*
3. **Due annullamenti insieme della stessa bici** (cliente che clicca due volte, o cliente e Kevin): un solo rimborso, un solo `cancelled`. *Task 5.*
4. **Annullare la bici di un altro, o oltre il termine, o una bici non online**: rifiutato senza toccare il denaro. *Task 5.*
5. **La produzione non prenota gratis**: `getPaymentGateway()` in produzione senza Stripe lancia, `beginCheckout` risponde `payments_unavailable` e **non tiene nessuna bici**; nessun file fuori dalla cartella dei pagamenti importa la finta. *Tasks 1 e 9.*

---

## File structure

| File | Responsabilità |
|---|---|
| `lib/booking/payments/gateway.ts` | Il contratto: tipi e interfaccia `PaymentGateway`. Nessuna logica. |
| `lib/booking/payments/fake.ts` | `FakeGateway`: sessioni in memoria, `pay()` per far «pagare», rimborsi idempotenti, un guasto programmabile. |
| `lib/booking/payments/index.ts` | `getPaymentGateway()` (la fabbrica con il rifiuto in produzione), `paymentsAvailable()`, `getFakeGateway()`, `PaymentsNotConfiguredError`. L'**unico** file che importa la finta. |
| `lib/booking/refund-deadline.ts` | `refundDeadline(startsOn)`, `isRefundable(startsOn, now)`: pure. |
| `lib/booking/quote.ts` | `quoteBikes(specs, days, options)`: prezzo e etichetta di ogni bici dal catalogo, sul server. |
| `lib/booking/refunds.ts` | `issueRefund` (una riga `booking_refunds` + la gateway, idempotente) e `cancelOnlineReservation`. |
| `lib/booking/late-payment.ts` | `settleLatePayment`: riassegnare le bici o rimborsare tutto. |
| `lib/booking/confirm.ts` | `confirmBooking(bookingId, gateway)`: idempotente, chiamabile più volte insieme. |
| `lib/booking/settle.ts` | `settleHold(bookingId, gateway)` e `settleOverdueHolds(gateway)`. |
| `lib/booking/checkout.ts` | `beginCheckout(input, gateway)`: l'orchestrazione dall'inizio del pagamento al reindirizzamento. |
| `lib/booking/holds.ts` (modifica) | `confirmHold` salva il riferimento di pagamento; `findBooking` esportata; `reviveBooking`. |
| `lib/db/schema.ts` + migrazione `0021` | tabella `booking_refunds`, enum `refund_status` e `refund_reason`. |
| `tests/db/fixtures.ts` (modifica) | `insertPaidBooking`, `startPendingBooking`; opzioni `totalCents` e `amountCents`. |

---

### Task 0: Il ramo di lavoro

**Files:** nessuno.

- [ ] **Step 1: Crea il worktree da `origin/staging`** (nello scratchpad di sessione, non in `C:\GitHub`)

```bash
cd /c/GitHub/lelettricaleoni.com
git fetch origin
git worktree add -b feat/booking-3b-payment-core "<scratchpad>/wt-3b-impl" origin/staging
```

- [ ] **Step 2: Collega `node_modules` e le variabili locali**

In PowerShell (una *junction*, **mai** `npm install` né `npm uninstall` nel worktree: sostituirebbe il collegamento con una cartella vera):

```powershell
New-Item -ItemType Junction -Path "<scratchpad>\wt-3b-impl\node_modules" -Target "C:\GitHub\lelettricaleoni.com\node_modules"
Copy-Item C:\GitHub\lelettricaleoni.com\.env.local "<scratchpad>\wt-3b-impl\.env.local"
```

- [ ] **Step 3: Controlla che parta pulito**

Run (nel worktree): `git branch --show-current && npx tsc --noEmit && npm test`
Expected: `feat/booking-3b-payment-core`, nessun errore di tipo, test unitari verdi.

---

### Task 1: La porta del pagamento, la finta e il rifiuto in produzione

**Files:**
- Create: `lib/booking/payments/gateway.ts`, `lib/booking/payments/fake.ts`, `lib/booking/payments/index.ts`
- Test: `lib/booking/payments/gateway.test.ts`, `lib/booking/payments/fake-guard.test.ts`

**Interfaces:**
- Consumes: `isProduction()` da `@/lib/app-env`.
- Produces (usati da tutti i compiti seguenti):
  - tipi `CheckoutLine`, `CreateSessionInput`, `CheckoutSession`, `SessionState`, `ExpireResult`, `RefundRequest`, `RefundResult`, interfaccia `PaymentGateway` (`name`, `createSession`, `getSession`, `expireSession`, `refund`);
  - `class FakeGateway implements PaymentGateway` con `pay(sessionId): boolean`, `failNextRefund: boolean`, `sessionCount(): number`, `refundCount(): number`, `describe(sessionId)`;
  - `getPaymentGateway(): PaymentGateway`, `paymentsAvailable(): boolean`, `getFakeGateway(): FakeGateway`, `class PaymentsNotConfiguredError`.

- [ ] **Step 1: Scrivi i test (devono fallire)**

`lib/booking/payments/gateway.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CreateSessionInput } from './gateway'
import { FakeGateway } from './fake'
import { getFakeGateway, getPaymentGateway, paymentsAvailable, PaymentsNotConfiguredError } from './index'

const input = (overrides: Partial<CreateSessionInput> = {}): CreateSessionInput => ({
  bookingId: 'b1',
  bookingKey: 'k1',
  customerEmail: 'a@example.test',
  language: 'it',
  lines: [{ label: 'eMTB', amountCents: 6000 }],
  expiresAt: new Date(Date.now() + 30 * 60_000),
  successUrl: 'https://example.test/ok',
  cancelUrl: 'https://example.test/back',
  ...overrides,
})
const gateway = () => new FakeGateway(new Map(), new Map())

describe('the fake gateway', () => {
  it('opens a session with a page to pay on', async () => {
    const fake = gateway()
    const session = await fake.createSession(input())
    expect(session.id).toMatch(/^fake_cs_/)
    expect(session.url).toBe(`/it/rent/fake-checkout/${session.id}`)
    expect(await fake.getSession(session.id)).toEqual({ status: 'open', url: session.url })
  })

  it('turns an open session into a paid one, with a payment reference', async () => {
    const fake = gateway()
    const { id } = await fake.createSession(input())
    expect(fake.pay(id)).toBe(true)
    expect(await fake.getSession(id)).toEqual({ status: 'paid', paymentRef: `fake_pi_${id}` })
  })

  it('refuses to pay twice, or to pay a session that is closed', async () => {
    const fake = gateway()
    const { id } = await fake.createSession(input())
    fake.pay(id)
    expect(fake.pay(id)).toBe(false)
    const other = await fake.createSession(input())
    await fake.expireSession(other.id)
    expect(fake.pay(other.id)).toBe(false)
    expect(fake.pay('fake_cs_unknown')).toBe(false)
  })

  it('expires an open session once; a paid or already expired one cannot be expired', async () => {
    const fake = gateway()
    const open = await fake.createSession(input())
    expect(await fake.expireSession(open.id)).toBe('expired')
    expect(await fake.getSession(open.id)).toEqual({ status: 'expired' })
    expect(await fake.expireSession(open.id)).toBe('not_open')
    const paid = await fake.createSession(input())
    fake.pay(paid.id)
    expect(await fake.expireSession(paid.id)).toBe('not_open')
    expect((await fake.getSession(paid.id)).status).toBe('paid')
  })

  it('reads a session past its time as expired, and cannot be paid', async () => {
    const fake = gateway()
    const { id } = await fake.createSession(input({ expiresAt: new Date(Date.now() - 1000) }))
    expect(await fake.getSession(id)).toEqual({ status: 'expired' })
    expect(fake.pay(id)).toBe(false)
    expect(await fake.expireSession(id)).toBe('not_open')
  })

  it('reads a session it does not know as expired', async () => {
    expect(await gateway().getSession('fake_cs_nobody')).toEqual({ status: 'expired' })
  })

  it('refunds a reservation once: asking again gives the same refund, and a failure is only for the next try', async () => {
    const fake = gateway()
    const first = await fake.refund({ reservationId: 'r1', paymentRef: 'pi', amountCents: 2000 })
    const again = await fake.refund({ reservationId: 'r1', paymentRef: 'pi', amountCents: 2000 })
    expect(first).toEqual({ status: 'succeeded', refundRef: 'fake_re_r1' })
    expect(again).toEqual(first)
    expect(fake.refundCount()).toBe(1)

    fake.failNextRefund = true
    expect(await fake.refund({ reservationId: 'r2', paymentRef: 'pi', amountCents: 500 })).toMatchObject({ status: 'failed' })
    expect(fake.refundCount()).toBe(1)
    expect(await fake.refund({ reservationId: 'r2', paymentRef: 'pi', amountCents: 500 })).toEqual({ status: 'succeeded', refundRef: 'fake_re_r2' })
  })
})

describe('which gateway an environment gets', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('never hands out the fake in production: without Stripe there is no gateway at all', () => {
    vi.stubEnv('APP_ENV', 'production')
    expect(() => getPaymentGateway()).toThrow(PaymentsNotConfiguredError)
    expect(() => getFakeGateway()).toThrow(PaymentsNotConfiguredError)
    expect(paymentsAvailable()).toBe(false)
  })

  it('hands out the fake on staging and on a laptop, always the same one', () => {
    for (const env of ['staging', 'development']) {
      vi.stubEnv('APP_ENV', env)
      expect(getPaymentGateway().name).toBe('fake')
      expect(getPaymentGateway()).toBe(getPaymentGateway())
      expect(getFakeGateway()).toBe(getPaymentGateway())
      expect(paymentsAvailable()).toBe(true)
    }
  })
})
```

`lib/booking/payments/fake-guard.test.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The fake gateway "pays" without money. It must be reachable only through getPaymentGateway(), which refuses to give it in
 * production: a file that imports it directly could take bookings for free there (Kevin, 2026-10-07: never publish without Stripe).
 */
const ROOTS = ['app', 'components', 'lib', 'worker', 'scripts']
const PAYMENTS = join('lib', 'booking', 'payments')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(path)
    return /\.(ts|tsx|mjs)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : []
  })
}

describe('the fake payment gateway', () => {
  const files = ROOTS.flatMap((root) => sourceFiles(root))

  it('finds the sources to look at', () => {
    expect(files.length).toBeGreaterThan(100)
    expect(files.some((file) => file.endsWith(`${sep}index.ts`) && file.includes(PAYMENTS))).toBe(true)
  })

  it('is imported by nobody outside the payments folder', () => {
    const offenders = files.filter((file) => !file.includes(PAYMENTS) && /booking\/payments\/fake/.test(readFileSync(file, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('is imported, inside the payments folder, only by index.ts', () => {
    const offenders = files
      .filter((file) => file.includes(PAYMENTS) && !file.endsWith(`${sep}index.ts`))
      .filter((file) => /from ['"]\.\/fake['"]/.test(readFileSync(file, 'utf8')))
    expect(offenders).toEqual([])
  })
})
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npx vitest run lib/booking/payments`
Expected: FAIL (`Cannot find module './fake'`).

- [ ] **Step 3: Scrivi il contratto**

`lib/booking/payments/gateway.ts`:

```ts
/*
 * The seam between a booking and the money. Everything that decides what a payment MEANS (hold, confirm, settle, refund) is written
 * against this interface; what moves the money is behind it. There are two ways to be behind it: the fake (staging and a laptop,
 * never production: ./index.ts) and Stripe (slice 3d).
 */

export interface CheckoutLine {
  /** What the person sees for this bike on the payment page. */
  label: string
  amountCents: number
}

export interface CreateSessionInput {
  bookingId: string
  /** The idempotency key of the whole booking: asking twice with it must give the same session. */
  bookingKey: string
  customerEmail: string
  language: string
  lines: CheckoutLine[]
  /** When the held bikes are given up. A real gateway may keep the session open longer; settleHold closes it. */
  expiresAt: Date
  successUrl: string
  cancelUrl: string
}

export interface CheckoutSession {
  id: string
  /** Where to send the person to pay. */
  url: string
}

export type SessionState =
  | { status: 'open'; url: string }
  | { status: 'paid'; /** The reference of the payment, kept to refund it. */ paymentRef: string }
  | { status: 'expired' }

/** `not_open`: it was already paid or already expired, so nothing was closed: read it again to see which. */
export type ExpireResult = 'expired' | 'not_open'

export interface RefundRequest {
  /** One refund per reservation: also the key that makes asking twice harmless. */
  reservationId: string
  paymentRef: string
  amountCents: number
}

export type RefundResult =
  | { status: 'succeeded' | 'pending'; refundRef: string }
  | { status: 'failed'; reason: string }

export interface PaymentGateway {
  readonly name: 'fake' | 'stripe'
  createSession(input: CreateSessionInput): Promise<CheckoutSession>
  getSession(sessionId: string): Promise<SessionState>
  /** Closes an OPEN session so it can no longer be paid. */
  expireSession(sessionId: string): Promise<ExpireResult>
  refund(request: RefundRequest): Promise<RefundResult>
}
```

- [ ] **Step 4: Scrivi la finta**

`lib/booking/payments/fake.ts`:

```ts
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

  async createSession(input: CreateSessionInput): Promise<CheckoutSession> {
    const id = `fake_cs_${crypto.randomUUID()}`
    this.sessions.set(id, { id, input, state: 'open' })
    return { id, url: this.urlOf(id, input.language) }
  }

  private urlOf(id: string, language: string): string {
    return `/${language}/rent/fake-checkout/${id}`
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

  async refund(request: RefundRequest): Promise<RefundResult> {
    const done = this.refunds.get(request.reservationId)
    if (done) return done
    if (this.failNextRefund) {
      this.failNextRefund = false
      return { status: 'failed', reason: 'fake refund failure' }
    }
    const result: RefundResult = { status: 'succeeded', refundRef: `fake_re_${request.reservationId}` }
    this.refunds.set(request.reservationId, result)
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

  refundCount(): number {
    return this.refunds.size
  }
}
```

- [ ] **Step 5: Scrivi la fabbrica**

`lib/booking/payments/index.ts`:

```ts
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
```

- [ ] **Step 6: Verifica che passino**

Run: `npx vitest run lib/booking/payments && npx tsc --noEmit`
Expected: tutti i test passano (gateway: 8, guardia: 3), nessun errore di tipo.

- [ ] **Step 7: Commit**

```bash
git add lib/booking/payments
git commit -m "Payment gateway seam: a contract, a fake that exists only outside production, and a factory that refuses in production"
```

---

### Task 2: La tabella dei rimborsi e le fixture

**Files:**
- Modify: `lib/db/schema.ts` (dopo `bookings`), `tests/db/fixtures.ts`
- Create: `lib/db/migrations/0021_booking_refunds.sql` (generata, poi rinominata e completata)
- Test: `tests/db/booking-refunds.test.ts`

**Interfaces:**
- Consumes: `bookings`, `bikeReservations` dallo schema; `createFixture`, `insertBooking`, `insertOnlineLine` dalle fixture.
- Produces:
  - tabella `bookingRefunds` (`id`, `reservationId` unico, `bookingId`, `amountCents`, `status`, `gatewayRefundId`, `reason`, `createdBy`, `createdAt`), enum `refundStatusEnum` (`pending|succeeded|failed`) e `refundReasonEnum` (`customer|staff|late_payment`), tipi `BookingRefund`, `NewBookingRefund`;
  - fixture `insertPaidBooking(fx, range, amounts, paymentRef?) → { bookingId, reservationIds, paymentRef }`; `insertBooking(..., { totalCents })`; `insertOnlineLine(..., status, amountCents = 4500)`.

- [ ] **Step 1: Scrivi il test (deve fallire)**

`tests/db/booking-refunds.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { db, bookingRefunds } from '@/lib/db'
import { CHECK_VIOLATION, FOREIGN_KEY_VIOLATION, UNIQUE_VIOLATION, pgErrorCode } from '@/lib/pg-errors'
import { createFixture, insertPaidBooking, type Fixture } from './fixtures'

const RANGE = { startsOn: '2031-12-01', endsOn: '2031-12-04' }

const failsWith = async (promise: Promise<unknown>) => {
  try { await promise } catch (error) { return pgErrorCode(error) }
  return undefined
}

describe('the booking_refunds table', () => {
  let fx: Fixture
  beforeEach(async () => { fx = await createFixture(2) })
  afterEach(async () => { await fx.cleanup() })

  it('keeps at most one refund per bike', async () => {
    const paid = await insertPaidBooking(fx, RANGE, [3000, 4000])
    const row = { reservationId: paid.reservationIds[0], bookingId: paid.bookingId, amountCents: 3000, reason: 'customer' as const }
    await db.insert(bookingRefunds).values(row)
    expect(await failsWith(db.insert(bookingRefunds).values({ ...row, amountCents: 1000 }))).toBe(UNIQUE_VIOLATION)
  })

  it('does not accept a refund of nothing, or of less', async () => {
    const paid = await insertPaidBooking(fx, RANGE, [3000])
    const base = { reservationId: paid.reservationIds[0], bookingId: paid.bookingId, reason: 'staff' as const }
    expect(await failsWith(db.insert(bookingRefunds).values({ ...base, amountCents: 0 }))).toBe(CHECK_VIOLATION)
    expect(await failsWith(db.insert(bookingRefunds).values({ ...base, amountCents: -100 }))).toBe(CHECK_VIOLATION)
  })

  it('points at a real bike and a real booking', async () => {
    const paid = await insertPaidBooking(fx, RANGE, [3000])
    expect(await failsWith(db.insert(bookingRefunds).values({
      reservationId: crypto.randomUUID(), bookingId: paid.bookingId, amountCents: 100, reason: 'customer',
    }))).toBe(FOREIGN_KEY_VIOLATION)
  })

  it('starts pending, with a creation time, and is closed to the API (row level security, no policies)', async () => {
    const paid = await insertPaidBooking(fx, RANGE, [3000])
    const [row] = await db.insert(bookingRefunds).values({
      reservationId: paid.reservationIds[0], bookingId: paid.bookingId, amountCents: 3000, reason: 'late_payment',
    }).returning()
    expect(row.status).toBe('pending')
    expect(row.gatewayRefundId).toBeNull()
    expect(row.createdBy).toBeNull()
    expect(row.createdAt).toBeInstanceOf(Date)
    const [{ relrowsecurity }] = await db.execute<{ relrowsecurity: boolean }>(
      sql`select relrowsecurity from pg_class where relname = 'booking_refunds'`)
    expect(relrowsecurity).toBe(true)
  })
})
```

- [ ] **Step 2: Aggiorna le fixture**

In `tests/db/fixtures.ts`:

1. importa `bookingRefunds` da `@/lib/db`;
2. in `createFixture(...).cleanup`, **prima** di cancellare prenotazioni e righe, aggiungi:

```ts
      await db.delete(bookingRefunds).where(inArray(
        bookingRefunds.bookingId,
        db.select({ id: bookings.id }).from(bookings).where(eq(bookings.customerId, customer.id)),
      ))
```

3. `insertBooking`: aggiungi `totalCents?: number` alle opzioni e usa `totalCents: options.totalCents ?? 4500`;
4. `insertOnlineLine`: aggiungi il sesto parametro `amountCents = 4500` e usalo al posto di `4500`;
5. in fondo al file:

```ts
/** A confirmed online booking with one confirmed bike per amount, paid with `paymentRef` (needs `amounts.length` bikes in the fixture). */
export async function insertPaidBooking(
  fx: Fixture, range: DayRange, amounts: number[], paymentRef = `fake_pi_${crypto.randomUUID()}`,
): Promise<{ bookingId: string; reservationIds: string[]; paymentRef: string }> {
  const bookingId = await insertBooking(fx.customerId, range, {
    status: 'confirmed', lineCount: amounts.length, totalCents: amounts.reduce((sum, amount) => sum + amount, 0),
  })
  await db.update(bookings)
    .set({ stripePaymentIntentId: paymentRef, stripeSessionId: `fake_cs_${crypto.randomUUID()}` })
    .where(eq(bookings.id, bookingId))
  const reservationIds: string[] = []
  for (const [index, amount] of amounts.entries()) {
    reservationIds.push(await insertOnlineLine(bookingId, fx.customerId, fx.unitIds[index], range, 'confirmed', amount))
  }
  return { bookingId, reservationIds, paymentRef }
}
```

- [ ] **Step 3: Verifica che fallisca**

Run: `npm run test:db -- tests/db/booking-refunds.test.ts`
Expected: FAIL (`bookingRefunds` non esiste).

- [ ] **Step 4: Aggiungi lo schema**

In `lib/db/schema.ts`, subito dopo `NewBooking`:

```ts
export const refundStatusEnum = pgEnum('refund_status', ['pending', 'succeeded', 'failed'])
export const refundReasonEnum = pgEnum('refund_reason', ['customer', 'staff', 'late_payment'])

// One refund per bike, at most (reservation_id is unique): a bike is never refunded twice, and a repeated request finds the row
// instead of making a second one. `gateway_refund_id` is the gateway's own id (Stripe's, or the fake's), whatever the gateway is.
export const bookingRefunds = pgTable('booking_refunds', {
  id:              uuid('id').primaryKey().defaultRandom(),
  reservationId:   uuid('reservation_id').notNull().unique().references(() => bikeReservations.id),
  bookingId:       uuid('booking_id').notNull().references(() => bookings.id),
  amountCents:     integer('amount_cents').notNull(),
  status:          refundStatusEnum('status').notNull().default('pending'),
  gatewayRefundId: text('gateway_refund_id'),
  reason:          refundReasonEnum('reason').notNull(),
  // The signed-in user who asked (staff or customer); null for what the system did itself (a late payment).
  createdBy:       uuid('created_by'),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('booking_refunds_booking_idx').on(t.bookingId)])

export type BookingRefund = typeof bookingRefunds.$inferSelect
export type NewBookingRefund = typeof bookingRefunds.$inferInsert
```

Se `bikeReservations` è dichiarata **dopo** `bookings` nel file, sposta la nuova tabella dopo `bikeReservations` (un riferimento a una `const` non ancora dichiarata fallisce a runtime).

- [ ] **Step 5: Genera, completa e applica la migrazione**

```bash
npx drizzle-kit generate
```

Rinomina il file generato in `lib/db/migrations/0021_booking_refunds.sql` e il `tag` corrispondente in `lib/db/migrations/meta/_journal.json`. **Aggiungi in fondo** (come in `0019`, a mano, perché le altre tabelle sono chiuse allo stesso modo):

```sql
--> statement-breakpoint
ALTER TABLE "booking_refunds" ADD CONSTRAINT "booking_refunds_amount_check" CHECK ("amount_cents" > 0);
--> statement-breakpoint
-- Explicit, not left to the ensure_rls event trigger: development and Preview do not have it.
ALTER TABLE "booking_refunds" ENABLE ROW LEVEL SECURITY;
```

Poi: `npm run db:migrate` (sviluppo, da `.env.local`).
Expected: `Migrations applied.`

- [ ] **Step 6: Verifica**

Run: `npm run test:db -- tests/db/booking-refunds.test.ts && npx tsc --noEmit`
Expected: 4 test passano, nessun errore di tipo.

- [ ] **Step 7: Commit**

```bash
git add lib/db tests/db
git commit -m "Refunds table: one refund per bike, with its own row-level security (migration 0021)"
```

---

### Task 3: Il termine del rimborso

**Files:**
- Create: `lib/booking/refund-deadline.ts`
- Test: `lib/booking/refund-deadline.test.ts`

**Interfaces:**
- Consumes: `ROME`, `IsoDate` da `@/lib/dates`; `TZDate` da `@date-fns/tz`.
- Produces: `refundDeadline(startsOn: IsoDate): Date`, `isRefundable(startsOn: IsoDate, now?: Date): boolean`.

- [ ] **Step 1: Scrivi il test (deve fallire)**

`lib/booking/refund-deadline.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isRefundable, refundDeadline } from './refund-deadline'

describe('refundDeadline', () => {
  it('is 09:00 in Rome, two days before the first day', () => {
    expect(refundDeadline('2031-07-10').toISOString()).toBe('2031-07-08T07:00:00.000Z') // summer time, +02:00
    expect(refundDeadline('2031-12-10').toISOString()).toBe('2031-12-08T08:00:00.000Z') // winter time, +01:00
  })

  it('follows the clock change: the hour of Rome, not a fixed number of hours', () => {
    // Summer time starts on Sunday 30 March 2031 and ends on Sunday 26 October 2031.
    expect(refundDeadline('2031-03-31').toISOString()).toBe('2031-03-29T08:00:00.000Z') // still winter
    expect(refundDeadline('2031-04-02').toISOString()).toBe('2031-03-31T07:00:00.000Z') // already summer
    expect(refundDeadline('2031-10-27').toISOString()).toBe('2031-10-25T07:00:00.000Z') // still summer
    expect(refundDeadline('2031-10-29').toISOString()).toBe('2031-10-27T08:00:00.000Z') // already winter
  })

  it('crosses a month and a year', () => {
    expect(refundDeadline('2031-03-01').toISOString()).toBe('2031-02-27T08:00:00.000Z')
    expect(refundDeadline('2032-01-01').toISOString()).toBe('2031-12-30T08:00:00.000Z')
  })
})

describe('isRefundable', () => {
  const start = '2031-07-10' // deadline 2031-07-08 07:00 UTC
  it('is true up to and including the deadline, false right after', () => {
    expect(isRefundable(start, new Date('2031-07-08T06:59:59.999Z'))).toBe(true)
    expect(isRefundable(start, new Date('2031-07-08T07:00:00.000Z'))).toBe(true)
    expect(isRefundable(start, new Date('2031-07-08T07:00:00.001Z'))).toBe(false)
  })

  it('is false on the day itself and after the start', () => {
    expect(isRefundable(start, new Date('2031-07-10T05:00:00.000Z'))).toBe(false)
    expect(isRefundable(start, new Date('2031-07-12T05:00:00.000Z'))).toBe(false)
  })
})
```

- [ ] **Step 2: Verifica che fallisca** — `npx vitest run lib/booking/refund-deadline.test.ts` → FAIL (modulo mancante).

- [ ] **Step 3: Implementa**

`lib/booking/refund-deadline.ts`:

```ts
import { TZDate } from '@date-fns/tz'
import { ROME, type IsoDate } from '@/lib/dates'

/** The refund is full up to 09:00 (Rome) of two days before the first day: the pickup is at opening. */
const DEADLINE_DAYS_BEFORE = 2
const DEADLINE_HOUR = 9

/** The last moment a customer can cancel a bike for a full refund. */
export function refundDeadline(startsOn: IsoDate): Date {
  const [year, month, day] = startsOn.split('-').map(Number)
  // TZDate does the calendar arithmetic (months, years, clock changes) in the zone of Rome.
  const deadline = new TZDate(year, month - 1, day - DEADLINE_DAYS_BEFORE, DEADLINE_HOUR, 0, 0, ROME)
  return new Date(deadline.getTime())
}

/** Whether a customer may still cancel a bike that starts on `startsOn` and get everything back. */
export function isRefundable(startsOn: IsoDate, now: Date = new Date()): boolean {
  return now.getTime() <= refundDeadline(startsOn).getTime()
}
```

- [ ] **Step 4: Verifica** — `npx vitest run lib/booking/refund-deadline.test.ts` → tutti passano.

- [ ] **Step 5: Commit**

```bash
git add lib/booking/refund-deadline.ts lib/booking/refund-deadline.test.ts
git commit -m "Refund deadline: 09:00 in Rome, two days before the first day"
```

---

### Task 4: Il prezzo di ogni bici, dal catalogo

**Files:**
- Create: `lib/booking/quote.ts`
- Test: `tests/db/quote.test.ts`

**Interfaces:**
- Consumes: `stayPriceCents`, `sumCents` da `./pricing`; `BikeSpec` da `./rules`; schema `bikeModels`, `bikeCategories`, `bikeModelTranslations`.
- Produces: `quoteBikes(specs: BikeSpec[], days: number, options?: { language?: string; publishedOnly?: boolean }): Promise<QuoteResult>`; `QuoteLine = BikeSpec & { amountCents: number; label: string }`; `QuoteResult = { status: 'ok'; lines: QuoteLine[]; totalCents: number } | { status: 'unknown_bike'; lineIndex: number } | { status: 'too_many_days'; lineIndex: number; maxDays: number }`.

- [ ] **Step 1: Scrivi il test (deve fallire)**

`tests/db/quote.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, bikeCategories, bikeModels, bikeModelTranslations } from '@/lib/db'
import { quoteBikes } from '@/lib/booking/quote'
import { createFixture, type Fixture } from './fixtures'

describe('quoteBikes', () => {
  let fx: Fixture
  beforeEach(async () => {
    fx = await createFixture(1)
    const [model] = await db.select().from(bikeModels).where(eq(bikeModels.id, fx.modelId))
    await db.update(bikeCategories).set({ day1Price: '10', day2Price: '18', day3Price: '24', maxRentalDays: 3 })
      .where(eq(bikeCategories.id, model.categoryId))
    await db.update(bikeModels).set({ isPublished: true }).where(eq(bikeModels.id, fx.modelId))
    await db.insert(bikeModelTranslations).values([
      { bikeModelId: fx.modelId, locale: 'it', name: 'Bici di prova', description: 'd' },
      { bikeModelId: fx.modelId, locale: 'de', name: 'Testrad', description: 'd' },
    ])
  })
  afterEach(async () => { await fx.cleanup() })

  const spec = () => ({ bikeModelId: fx.modelId, bikeSizeId: fx.sizeId, bikeVersionId: fx.versionId })

  it('prices every bike for the whole stay, in cents, with its name in the language asked', async () => {
    const result = await quoteBikes([spec(), spec()], 2, { language: 'de' })
    expect(result).toEqual({
      status: 'ok',
      lines: [{ ...spec(), amountCents: 1800, label: 'Testrad' }, { ...spec(), amountCents: 1800, label: 'Testrad' }],
      totalCents: 3600,
    })
  })

  it('falls back to the Italian name when the language has none, and to the category name when nothing is translated', async () => {
    const english = await quoteBikes([spec()], 1, { language: 'en' })
    expect(english.status === 'ok' && english.lines[0].label).toBe('Bici di prova')
    await db.delete(bikeModelTranslations).where(eq(bikeModelTranslations.bikeModelId, fx.modelId))
    const bare = await quoteBikes([spec()], 1, { language: 'it' })
    expect(bare.status === 'ok' && bare.lines[0].label).toMatch(/^db-test-/)
  })

  it("applies the model's own percentage and rounds to the whole euro, as the shop does", async () => {
    await db.update(bikeModels).set({ priceAdjustmentPercent: '10' }).where(eq(bikeModels.id, fx.modelId))
    const result = await quoteBikes([spec()], 3)
    expect(result.status === 'ok' && result.lines[0].amountCents).toBe(2600) // 24 + 10% = 26.40 -> 26
  })

  it('names the line whose model the category cannot rent for that long', async () => {
    expect(await quoteBikes([spec(), spec()], 4)).toEqual({ status: 'too_many_days', lineIndex: 0, maxDays: 3 })
  })

  it('names the line with a model that does not exist, or that is not published', async () => {
    const stranger = { ...spec(), bikeModelId: crypto.randomUUID() }
    expect(await quoteBikes([spec(), stranger], 1)).toEqual({ status: 'unknown_bike', lineIndex: 1 })
    await db.update(bikeModels).set({ isPublished: false }).where(eq(bikeModels.id, fx.modelId))
    expect(await quoteBikes([spec()], 1)).toEqual({ status: 'unknown_bike', lineIndex: 0 })
    expect((await quoteBikes([spec()], 1, { publishedOnly: false })).status).toBe('ok')
  })
})
```

- [ ] **Step 2: Verifica che fallisca** — `npm run test:db -- tests/db/quote.test.ts` → FAIL (modulo mancante).

- [ ] **Step 3: Implementa**

`lib/booking/quote.ts`:

```ts
import { eq, inArray } from 'drizzle-orm'
import { db, bikeCategories, bikeModels, bikeModelTranslations } from '@/lib/db'
import { stayPriceCents, sumCents } from './pricing'
import type { BikeSpec } from './rules'

export interface QuoteLine extends BikeSpec {
  amountCents: number
  /** The model's name in the customer's language, for the payment page. */
  label: string
}

export type QuoteResult =
  | { status: 'ok'; lines: QuoteLine[]; totalCents: number }
  | { status: 'unknown_bike'; lineIndex: number }
  | { status: 'too_many_days'; lineIndex: number; maxDays: number }

/**
 * What each bike of a cart costs for `days` whole days, from the catalogue: the price list of its category plus the model's own
 * percentage. Always the server's number: the browser shows an estimate and never decides. The first line that cannot be priced is
 * named, so the person is told which one.
 */
export async function quoteBikes(
  specs: BikeSpec[], days: number, options: { language?: string; publishedOnly?: boolean } = {},
): Promise<QuoteResult> {
  const language = options.language ?? 'it'
  const publishedOnly = options.publishedOnly ?? true
  const modelIds = [...new Set(specs.map((spec) => spec.bikeModelId))]

  const models = await db
    .select({ id: bikeModels.id, percent: bikeModels.priceAdjustmentPercent, published: bikeModels.isPublished, category: bikeCategories })
    .from(bikeModels)
    .innerJoin(bikeCategories, eq(bikeCategories.id, bikeModels.categoryId))
    .where(inArray(bikeModels.id, modelIds))
  const names = await db
    .select({ modelId: bikeModelTranslations.bikeModelId, locale: bikeModelTranslations.locale, name: bikeModelTranslations.name })
    .from(bikeModelTranslations)
    .where(inArray(bikeModelTranslations.bikeModelId, modelIds))
  const byId = new Map(models.map((row) => [row.id, row]))

  const lines: QuoteLine[] = []
  for (const [lineIndex, spec] of specs.entries()) {
    const model = byId.get(spec.bikeModelId)
    if (!model || (publishedOnly && !model.published)) return { status: 'unknown_bike', lineIndex }
    const amountCents = stayPriceCents(model.category, days, Number(model.percent))
    if (amountCents === null) return { status: 'too_many_days', lineIndex, maxDays: model.category.maxRentalDays }
    const own = names.filter((entry) => entry.modelId === model.id)
    const label = (own.find((entry) => entry.locale === language) ?? own.find((entry) => entry.locale === 'it') ?? own[0])?.name
      ?? model.category.name
    lines.push({ ...spec, amountCents, label })
  }
  return { status: 'ok', lines, totalCents: sumCents(lines.map((line) => line.amountCents)) }
}
```

- [ ] **Step 4: Verifica** — `npm run test:db -- tests/db/quote.test.ts && npx tsc --noEmit` → 5 test passano.

- [ ] **Step 5: Commit**

```bash
git add lib/booking/quote.ts tests/db/quote.test.ts
git commit -m "Booking quote: the price and the name of every bike of a cart, from the catalogue"
```

---

### Task 5: Rimborsare una bici e annullarla

**Files:**
- Create: `lib/booking/refunds.ts`
- Test: `tests/db/refunds.test.ts`

**Interfaces:**
- Consumes: `PaymentGateway`, `getPaymentGateway` (Task 1); `isRefundable`, `refundDeadline` (Task 3); `bookingRefunds` (Task 2); fixture `insertPaidBooking`.
- Produces:
  - `issueRefund(input: IssueRefundInput, gateway: PaymentGateway): Promise<IssuedRefund>` con `IssueRefundInput = { reservationId; bookingId; amountCents; paymentRef; reason: 'customer'|'staff'|'late_payment'; createdBy: string | null }` e `IssuedRefund = { status: 'succeeded'|'pending'; refundRef } | { status: 'failed'; reason }`;
  - `cancelOnlineReservation(input: CancelOnlineInput, gateway?: PaymentGateway): Promise<CancelOnlineResult>`, con `CancelActor = { kind: 'customer'; customerId: string; userId: string } | { kind: 'staff'; userId: string }`, `CancelOnlineInput = { reservationId; actor: CancelActor; refundCents?: number; now?: Date }` e `CancelOnlineResult = { status: 'cancelled'; refundedCents: number; bookingCancelled: boolean; refund: 'none'|'succeeded'|'pending' } | { status: 'already_cancelled' } | { status: 'not_found' } | { status: 'too_late'; deadline: Date } | { status: 'invalid_amount' } | { status: 'refund_failed'; reason: string }`.

- [ ] **Step 1: Scrivi il test (deve fallire)**

`tests/db/refunds.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, bikeReservations, bookingRefunds, bookings, customers } from '@/lib/db'
import { FakeGateway } from '@/lib/booking/payments/fake'
import { cancelOnlineReservation, issueRefund, type CancelActor } from '@/lib/booking/refunds'
import { createFixture, insertPaidBooking, type Fixture } from './fixtures'

const FAR = { startsOn: '2031-12-10', endsOn: '2031-12-13' }
const NOW_EARLY = new Date('2031-12-01T10:00:00Z')

describe('refunds and the cancellation of one online bike', () => {
  let fx: Fixture
  let gateway: FakeGateway
  const strangers: string[] = []
  beforeEach(async () => { fx = await createFixture(3); gateway = new FakeGateway(new Map(), new Map()) })
  afterEach(async () => {
    await fx.cleanup()
    for (const id of strangers.splice(0)) await db.delete(customers).where(eq(customers.id, id))
  })

  const customer = (): CancelActor => ({ kind: 'customer', customerId: fx.customerId, userId: crypto.randomUUID() })
  const staff = (): CancelActor => ({ kind: 'staff', userId: crypto.randomUUID() })
  const stateOf = async (reservationId: string) =>
    (await db.select().from(bikeReservations).where(eq(bikeReservations.id, reservationId)))[0].status
  const bookingStatus = async (id: string) => (await db.select().from(bookings).where(eq(bookings.id, id)))[0].status
  const refundsOf = (bookingId: string) => db.select().from(bookingRefunds).where(eq(bookingRefunds.bookingId, bookingId))

  describe('the customer', () => {
    it('cancels one bike of two and gets that bike back, in full; the other stays', async () => {
      const paid = await insertPaidBooking(fx, FAR, [3000, 4000])
      const result = await cancelOnlineReservation({ reservationId: paid.reservationIds[0], actor: customer(), now: NOW_EARLY }, gateway)
      expect(result).toEqual({ status: 'cancelled', refundedCents: 3000, bookingCancelled: false, refund: 'succeeded' })
      expect(await stateOf(paid.reservationIds[0])).toBe('cancelled')
      expect(await stateOf(paid.reservationIds[1])).toBe('confirmed')
      expect(await bookingStatus(paid.bookingId)).toBe('confirmed')
      expect(await refundsOf(paid.bookingId)).toMatchObject([{ amountCents: 3000, status: 'succeeded', reason: 'customer', gatewayRefundId: expect.stringMatching(/^fake_re_/) }])
    })

    it('cancels the last bike and the booking is cancelled with it', async () => {
      const paid = await insertPaidBooking(fx, FAR, [3000, 4000])
      await cancelOnlineReservation({ reservationId: paid.reservationIds[0], actor: customer(), now: NOW_EARLY }, gateway)
      const last = await cancelOnlineReservation({ reservationId: paid.reservationIds[1], actor: customer(), now: NOW_EARLY }, gateway)
      expect(last).toMatchObject({ status: 'cancelled', bookingCancelled: true })
      expect(await bookingStatus(paid.bookingId)).toBe('cancelled')
    })

    it('frees the dates of the bike that was cancelled, and not the others', async () => {
      const paid = await insertPaidBooking(fx, FAR, [3000, 4000])
      await cancelOnlineReservation({ reservationId: paid.reservationIds[0], actor: customer(), now: NOW_EARLY }, gateway)
      const { getFreeBikes } = await import('@/lib/booking/availability')
      const mine = (await getFreeBikes(FAR, { publishedOnly: false })).find((row) => row.bikeModelId === fx.modelId)
      expect(mine?.free).toBe(2) // 3 bikes, 1 still confirmed
    })

    it('cannot cancel after the deadline (09:00 in Rome, two days before): nothing is refunded', async () => {
      const paid = await insertPaidBooking(fx, FAR, [3000])
      const result = await cancelOnlineReservation({ reservationId: paid.reservationIds[0], actor: customer(), now: new Date('2031-12-08T08:00:01Z') }, gateway)
      expect(result).toMatchObject({ status: 'too_late' })
      expect(await stateOf(paid.reservationIds[0])).toBe('confirmed')
      expect(gateway.refundCount()).toBe(0)
    })

    it('cannot cancel the bike of somebody else: it does not even exist for them', async () => {
      const paid = await insertPaidBooking(fx, FAR, [3000])
      const [stranger] = await db.insert(customers).values({ firstName: 'db-test', lastName: `other-${crypto.randomUUID()}` }).returning()
      strangers.push(stranger.id)
      const result = await cancelOnlineReservation({
        reservationId: paid.reservationIds[0], actor: { kind: 'customer', customerId: stranger.id, userId: crypto.randomUUID() }, now: NOW_EARLY,
      }, gateway)
      expect(result).toEqual({ status: 'not_found' })
      expect(await stateOf(paid.reservationIds[0])).toBe('confirmed')
      expect(gateway.refundCount()).toBe(0)
    })

    it('cannot cancel what is not an online bike, or does not exist', async () => {
      expect(await cancelOnlineReservation({ reservationId: crypto.randomUUID(), actor: customer(), now: NOW_EARLY }, gateway)).toEqual({ status: 'not_found' })
    })

    it('says so when the bike was already cancelled', async () => {
      const paid = await insertPaidBooking(fx, FAR, [3000])
      await cancelOnlineReservation({ reservationId: paid.reservationIds[0], actor: customer(), now: NOW_EARLY }, gateway)
      expect(await cancelOnlineReservation({ reservationId: paid.reservationIds[0], actor: customer(), now: NOW_EARLY }, gateway))
        .toEqual({ status: 'already_cancelled' })
    })

    it('two cancellations at once of the same bike: one refund, one cancellation', async () => {
      const paid = await insertPaidBooking(fx, FAR, [3000, 4000])
      const ask = () => cancelOnlineReservation({ reservationId: paid.reservationIds[0], actor: customer(), now: NOW_EARLY }, gateway)
      const results = await Promise.all([ask(), ask()])
      expect(results.map((r) => r.status).sort()).toEqual(['already_cancelled', 'cancelled'])
      expect(await refundsOf(paid.bookingId)).toHaveLength(1)
      expect(gateway.refundCount()).toBe(1)
    })

    it('keeps the bike and says why when the gateway refuses; asking again finishes the job', async () => {
      const paid = await insertPaidBooking(fx, FAR, [3000])
      gateway.failNextRefund = true
      const refused = await cancelOnlineReservation({ reservationId: paid.reservationIds[0], actor: customer(), now: NOW_EARLY }, gateway)
      expect(refused).toMatchObject({ status: 'refund_failed' })
      expect(await stateOf(paid.reservationIds[0])).toBe('confirmed')
      expect(await refundsOf(paid.bookingId)).toMatchObject([{ status: 'failed' }])
      const retried = await cancelOnlineReservation({ reservationId: paid.reservationIds[0], actor: customer(), now: NOW_EARLY }, gateway)
      expect(retried).toMatchObject({ status: 'cancelled', refund: 'succeeded' })
      expect(await refundsOf(paid.bookingId)).toMatchObject([{ status: 'succeeded' }])
    })
  })

  describe('the staff', () => {
    it('cancels with a partial refund, at any time, and the refund is theirs', async () => {
      const paid = await insertPaidBooking(fx, FAR, [4000])
      const actor = staff()
      const result = await cancelOnlineReservation({ reservationId: paid.reservationIds[0], actor, refundCents: 1500, now: new Date('2031-12-12T10:00:00Z') }, gateway)
      expect(result).toEqual({ status: 'cancelled', refundedCents: 1500, bookingCancelled: true, refund: 'succeeded' })
      expect(await refundsOf(paid.bookingId)).toMatchObject([{ amountCents: 1500, reason: 'staff', createdBy: actor.userId }])
    })

    it('cancels with no refund at all: no refund row, no call to the gateway', async () => {
      const paid = await insertPaidBooking(fx, FAR, [4000])
      const result = await cancelOnlineReservation({ reservationId: paid.reservationIds[0], actor: staff(), refundCents: 0, now: NOW_EARLY }, gateway)
      expect(result).toEqual({ status: 'cancelled', refundedCents: 0, bookingCancelled: true, refund: 'none' })
      expect(await refundsOf(paid.bookingId)).toHaveLength(0)
      expect(gateway.refundCount()).toBe(0)
    })

    it('refunds everything by default, and refuses an amount that is more than the bike or not whole cents', async () => {
      const paid = await insertPaidBooking(fx, FAR, [4000, 2000])
      expect(await cancelOnlineReservation({ reservationId: paid.reservationIds[0], actor: staff(), refundCents: 4001, now: NOW_EARLY }, gateway)).toEqual({ status: 'invalid_amount' })
      expect(await cancelOnlineReservation({ reservationId: paid.reservationIds[0], actor: staff(), refundCents: 10.5, now: NOW_EARLY }, gateway)).toEqual({ status: 'invalid_amount' })
      expect(await cancelOnlineReservation({ reservationId: paid.reservationIds[0], actor: staff(), refundCents: -1, now: NOW_EARLY }, gateway)).toEqual({ status: 'invalid_amount' })
      expect(await stateOf(paid.reservationIds[0])).toBe('confirmed')
      const all = await cancelOnlineReservation({ reservationId: paid.reservationIds[0], actor: staff(), now: NOW_EARLY }, gateway)
      expect(all).toMatchObject({ status: 'cancelled', refundedCents: 4000 })
    })
  })

  describe('issueRefund', () => {
    it('never refunds more than the booking was paid, whatever is asked bike by bike', async () => {
      const paid = await insertPaidBooking(fx, FAR, [3000, 4000])
      const base = { bookingId: paid.bookingId, paymentRef: paid.paymentRef, reason: 'staff' as const, createdBy: null }
      expect(await issueRefund({ ...base, reservationId: paid.reservationIds[0], amountCents: 6000 }, gateway)).toMatchObject({ status: 'succeeded' })
      expect(await issueRefund({ ...base, reservationId: paid.reservationIds[1], amountCents: 1001 }, gateway)).toEqual({ status: 'failed', reason: 'over_total' })
      expect(await issueRefund({ ...base, reservationId: paid.reservationIds[1], amountCents: 1000 }, gateway)).toMatchObject({ status: 'succeeded' })
      expect(gateway.refundCount()).toBe(2)
    })

    it('a refund that already succeeded is not asked for again', async () => {
      const paid = await insertPaidBooking(fx, FAR, [3000])
      const request = { bookingId: paid.bookingId, paymentRef: paid.paymentRef, reservationId: paid.reservationIds[0], amountCents: 3000, reason: 'customer' as const, createdBy: null }
      const first = await issueRefund(request, gateway)
      const second = await issueRefund(request, gateway)
      expect(second).toEqual(first)
      expect(await refundsOf(paid.bookingId)).toHaveLength(1)
    })
  })
})
```

- [ ] **Step 2: Verifica che fallisca** — `npm run test:db -- tests/db/refunds.test.ts` → FAIL (modulo mancante).

- [ ] **Step 3: Implementa**

`lib/booking/refunds.ts`:

```ts
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
 *     statement that checks the refunds of the booking will not add up to more than it was paid;
 *  2. the gateway is asked, with the reservation as its idempotency key (a repeated request gets the same refund);
 *  3. the row is updated with the answer.
 * A refund that already succeeded is returned as it is; one that failed or stayed pending is asked again, for the amount first written.
 */
export async function issueRefund(input: IssueRefundInput, gateway: PaymentGateway): Promise<IssuedRefund> {
  const inserted = await db.execute<{ id: string }>(sql`
    insert into booking_refunds (reservation_id, booking_id, amount_cents, reason, created_by)
    select ${input.reservationId}::uuid, b.id, ${input.amountCents}::int, ${input.reason}::refund_reason, ${input.createdBy}::uuid
    from bookings b
    where b.id = ${input.bookingId}::uuid
      and ${input.amountCents}::int
        + coalesce((select sum(f.amount_cents) from booking_refunds f where f.booking_id = b.id and f.status <> 'failed'), 0)
        <= b.total_cents
    on conflict (reservation_id) do nothing
    returning id`)

  let amountCents = input.amountCents
  if (inserted.length === 0) {
    const [existing] = await db.select().from(bookingRefunds).where(eq(bookingRefunds.reservationId, input.reservationId))
    if (!existing) return { status: 'failed', reason: 'over_total' }
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
```

- [ ] **Step 4: Verifica** — `npm run test:db -- tests/db/refunds.test.ts && npx tsc --noEmit`
Expected: i 14 test passano. Se «two cancellations at once» fallisce con un solo `cancelled` e un `refund_failed`, rileggi `issueRefund`: la seconda chiamata deve trovare la riga `pending` e richiamare la gateway con la stessa chiave.

- [ ] **Step 5: Commit**

```bash
git add lib/booking/refunds.ts tests/db/refunds.test.ts
git commit -m "Refunds: one row and one gateway call per bike, and the cancellation of one online bike, by the customer or the staff"
```

---

### Task 6: Confermare un pagamento

**Files:**
- Modify: `lib/booking/holds.ts` (`confirmHold` con il riferimento di pagamento; `findById` → `findBooking` esportata; `reviveBooking`)
- Create: `lib/booking/confirm.ts`, `lib/booking/late-payment.ts` (qui solo un segnaposto che lancia: il corpo vero è il Task 7)
- Modify: `tests/db/fixtures.ts` (`startPendingBooking`), `tests/db/holds.test.ts` (il riferimento salvato)
- Test: `tests/db/confirm.test.ts`

**Interfaces:**
- Consumes: `startHold`, `confirmHold` (3a), `PaymentGateway`, `FakeGateway`.
- Produces:
  - `confirmHold(bookingId: string, paymentRef?: string | null): Promise<{ confirmed: boolean; lines: number }>` (salva `stripe_payment_intent_id` nella stessa istruzione);
  - `findBooking(bookingId: string): Promise<Booking | undefined>`; `reviveBooking(bookingId: string, minutes?: number): Promise<boolean>`;
  - `confirmBooking(bookingId: string, gateway?: PaymentGateway): Promise<ConfirmResult>` con `ConfirmResult = { status: 'confirmed' | 'already_confirmed' | 'not_paid' | 'incomplete' | 'reassigned' | 'refunded'; bookingId: string } | { status: 'closed'; bookingId: string; bookingStatus: string } | { status: 'refund_failed'; bookingId: string } | { status: 'unknown_booking' }`;
  - fixture `startPendingBooking(fx, gateway, range, lineCount) → { bookingId, sessionId, holdExpiresAt }`.

- [ ] **Step 1: Estendi le fixture**

In `tests/db/fixtures.ts`, aggiungi gli import `startHold` da `@/lib/booking/holds` e `type PaymentGateway` da `@/lib/booking/payments/gateway`, e in fondo:

```ts
/** A pending booking of the fixture's customer with `lineCount` bikes held and a payment session open on `gateway`. */
export async function startPendingBooking(
  fx: Fixture, gateway: PaymentGateway, range: DayRange, lineCount: number,
): Promise<{ bookingId: string; sessionId: string; holdExpiresAt: Date }> {
  const bookingKey = crypto.randomUUID()
  const lines = Array.from({ length: lineCount }, () => ({
    bikeModelId: fx.modelId, bikeSizeId: fx.sizeId, bikeVersionId: fx.versionId, amountCents: 3000,
  }))
  const hold = await startHold({ bookingKey, customerId: fx.customerId, ...range, language: 'it', lines })
  if (hold.status !== 'held') throw new Error(`setup: expected held, got ${hold.status}`)
  const session = await gateway.createSession({
    bookingId: hold.bookingId, bookingKey, customerEmail: 'db-test@example.test', language: 'it',
    lines: lines.map((line) => ({ label: 'bike', amountCents: line.amountCents })),
    expiresAt: hold.holdExpiresAt, successUrl: 'https://example.test/ok', cancelUrl: 'https://example.test/back',
  })
  await db.update(bookings).set({ stripeSessionId: session.id }).where(eq(bookings.id, hold.bookingId))
  return { bookingId: hold.bookingId, sessionId: session.id, holdExpiresAt: hold.holdExpiresAt }
}
```

- [ ] **Step 2: Scrivi i test (devono fallire)**

Aggiungi in `tests/db/holds.test.ts` (dopo il test «confirms a pending booking and its bikes, once»):

```ts
  it('keeps the reference of the payment when it confirms', async () => {
    const result = await startHold(input())
    if (result.status !== 'held') throw new Error('setup')
    await confirmHold(result.bookingId, 'pi_test_123')
    expect((await bookingOf(result.bookingId)).stripePaymentIntentId).toBe('pi_test_123')
  })
```

`tests/db/confirm.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, bikeReservations, bookings } from '@/lib/db'
import { FakeGateway } from '@/lib/booking/payments/fake'
import { confirmBooking } from '@/lib/booking/confirm'
import { expireBooking } from '@/lib/booking/holds'
import { createFixture, insertBooking, startPendingBooking, type Fixture } from './fixtures'

const RANGE = { startsOn: '2031-11-03', endsOn: '2031-11-06' }

describe('confirmBooking', () => {
  let fx: Fixture
  let gateway: FakeGateway
  beforeEach(async () => { fx = await createFixture(3); gateway = new FakeGateway(new Map(), new Map()) })
  afterEach(async () => { await fx.cleanup() })

  const bookingOf = async (id: string) => (await db.select().from(bookings).where(eq(bookings.id, id)))[0]
  const linesOf = (id: string) => db.select().from(bikeReservations).where(eq(bikeReservations.bookingId, id))

  it('confirms the booking and its bikes once the session is paid, and keeps the payment reference', async () => {
    const pending = await startPendingBooking(fx, gateway, RANGE, 2)
    gateway.pay(pending.sessionId)
    expect(await confirmBooking(pending.bookingId, gateway)).toEqual({ status: 'confirmed', bookingId: pending.bookingId })
    const booking = await bookingOf(pending.bookingId)
    expect(booking).toMatchObject({ status: 'confirmed', stripePaymentIntentId: `fake_pi_${pending.sessionId}` })
    expect((await linesOf(pending.bookingId)).every((line) => line.status === 'confirmed')).toBe(true)
  })

  it('does nothing while the session is not paid', async () => {
    const pending = await startPendingBooking(fx, gateway, RANGE, 1)
    expect(await confirmBooking(pending.bookingId, gateway)).toEqual({ status: 'not_paid', bookingId: pending.bookingId })
    expect((await bookingOf(pending.bookingId)).status).toBe('pending')
  })

  it('is safe to call again: the second call finds it already confirmed', async () => {
    const pending = await startPendingBooking(fx, gateway, RANGE, 1)
    gateway.pay(pending.sessionId)
    await confirmBooking(pending.bookingId, gateway)
    expect(await confirmBooking(pending.bookingId, gateway)).toEqual({ status: 'already_confirmed', bookingId: pending.bookingId })
  })

  it('called twice at the same time (the webhook and the page the customer lands on): one confirmation, nothing broken', async () => {
    const pending = await startPendingBooking(fx, gateway, RANGE, 2)
    gateway.pay(pending.sessionId)
    const results = await Promise.all([confirmBooking(pending.bookingId, gateway), confirmBooking(pending.bookingId, gateway)])
    expect(results.map((r) => r.status).sort()).toEqual(['already_confirmed', 'confirmed'])
    expect((await bookingOf(pending.bookingId)).status).toBe('confirmed')
    expect((await linesOf(pending.bookingId)).every((line) => line.status === 'confirmed')).toBe(true)
  })

  it('knows nothing of a booking that does not exist, and of one with no session yet', async () => {
    expect(await confirmBooking(crypto.randomUUID(), gateway)).toEqual({ status: 'unknown_booking' })
    const bare = await insertBooking(fx.customerId, RANGE) // pending, no session
    expect(await confirmBooking(bare, gateway)).toEqual({ status: 'not_paid', bookingId: bare })
  })

  it('leaves a booking alone that is already closed for another reason (cancelled, refunded)', async () => {
    const pending = await startPendingBooking(fx, gateway, RANGE, 1)
    gateway.pay(pending.sessionId)
    await db.update(bookings).set({ status: 'cancelled' }).where(eq(bookings.id, pending.bookingId))
    expect(await confirmBooking(pending.bookingId, gateway)).toEqual({ status: 'closed', bookingId: pending.bookingId, bookingStatus: 'cancelled' })
  })

  it('does not confirm a pending booking that is missing some of its bikes', async () => {
    const pending = await startPendingBooking(fx, gateway, RANGE, 2)
    gateway.pay(pending.sessionId)
    await db.update(bikeReservations).set({ status: 'expired' }).where(eq(bikeReservations.bookingId, pending.bookingId))
    // booking still pending, all its bikes gone: a payment cannot confirm bikes that are not held
    expect(await confirmBooking(pending.bookingId, gateway)).toEqual({ status: 'incomplete', bookingId: pending.bookingId })
    expect((await bookingOf(pending.bookingId)).status).toBe('pending')
  })
})
```

- [ ] **Step 3: Verifica che falliscano** — `npm run test:db -- tests/db/confirm.test.ts tests/db/holds.test.ts` → FAIL.

- [ ] **Step 4: Modifica `holds.ts`**

1. Rinomina `findById` in `findBooking` **ed esportala** (`sed -i 's/findById/findBooking/g' lib/booking/holds.ts`, poi aggiungi `export` alla definizione).
2. Cambia `confirmHold`:

```ts
export async function confirmHold(bookingId: string, paymentRef: string | null = null): Promise<{ confirmed: boolean; lines: number }> {
  const [row] = await db.execute<{ bookings: number; lines: number }>(sql`
    with b as (
      update bookings set status = 'confirmed', confirmed_at = now(),
        stripe_payment_intent_id = coalesce(${paymentRef}::text, stripe_payment_intent_id)
      where id = ${bookingId}::uuid and status = 'pending'
        and line_count = (select count(*) from bike_reservations r where r.booking_id = bookings.id and r.status = 'held')
      returning id
    ), l as (
      update bike_reservations set status = 'confirmed'
      where booking_id in (select id from b) and status = 'held'
      returning id
    )
    select (select count(*) from b)::int as bookings, (select count(*) from l)::int as lines`)
  return { confirmed: row.bookings > 0, lines: row.lines }
}
```

3. Aggiungi in fondo (serve al Task 7):

```ts
/**
 * Expired → pending again, for a few minutes: the first step of giving a bike to a payment that arrived after its bikes were freed.
 * False when the booking is not expired any more, or when the customer has another payment on its way (one at a time).
 */
export async function reviveBooking(bookingId: string, minutes = 5): Promise<boolean> {
  try {
    const rows = await db.execute<{ id: string }>(sql`
      update bookings set status = 'pending', hold_expires_at = now() + make_interval(mins => ${minutes})
      where id = ${bookingId}::uuid and status = 'expired'
      returning id`)
    return rows.length > 0
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) return false
    throw error
  }
}
```

- [ ] **Step 5: Scrivi `confirm.ts` e il segnaposto di `late-payment.ts`**

`lib/booking/late-payment.ts` (segnaposto **temporaneo**, sostituito nel Task 7 prima del commit di quel compito; non va mai in un commit di questo):

```ts
import type { ConfirmResult } from './confirm'
import type { PaymentGateway } from './payments/gateway'

export async function settleLatePayment(bookingId: string, _paymentRef: string, _gateway: PaymentGateway): Promise<ConfirmResult> {
  throw new Error(`late payment of ${bookingId}: not written yet (Task 7)`)
}
```

`lib/booking/confirm.ts`:

```ts
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
  if (booking.status === 'expired') return settleLatePayment(bookingId, session.paymentRef, gateway)
  return { status: 'closed', bookingId, bookingStatus: booking.status }
}
```

- [ ] **Step 6: Verifica** — `npm run test:db -- tests/db/confirm.test.ts tests/db/holds.test.ts && npx tsc --noEmit`
Expected: 7 test di conferma + i test di `holds` passano. Nessun test di questo compito percorre il ramo `expired` (è il Task 7).

- [ ] **Step 7: Commit** (senza il segnaposto: lo si committa insieme al Task 7)

```bash
git add lib/booking/holds.ts lib/booking/confirm.ts tests/db
git stash push lib/booking/late-payment.ts -u 2>/dev/null || true
git commit -m "Confirm a paid booking: idempotent, safe when called twice at once, and it keeps the payment reference"
git stash pop 2>/dev/null || true
```

Se preferisci non usare lo stash: committa anche il segnaposto e sostituiscilo nel commit successivo; non va mai in una PR.

---

### Task 7: Il pagamento arrivato quando il posto non c'è più

**Files:**
- Modify: `lib/booking/late-payment.ts` (corpo vero)
- Test: `tests/db/late-payment.test.ts`

**Interfaces:**
- Consumes: `reviveBooking`, `holdOneBike`, `confirmHold`, `expireBooking`, `findBooking` (`holds.ts`); `issueRefund` (Task 5); `ConfirmResult` (Task 6).
- Produces: `settleLatePayment(bookingId: string, paymentRef: string, gateway: PaymentGateway): Promise<ConfirmResult>`.
  Esiti: `reassigned` (le stesse bici, o altre uguali, ora confermate), `refunded` (tutto rimborsato, testata `failed_refunded`), `refund_failed` (qualche rimborso non è andato: ritentabile, la testata resta `expired`).

- [ ] **Step 1: Scrivi il test (deve fallire)**

`tests/db/late-payment.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, bikeReservations, bookingRefunds, bookings } from '@/lib/db'
import { FakeGateway } from '@/lib/booking/payments/fake'
import { confirmBooking } from '@/lib/booking/confirm'
import { expireBooking } from '@/lib/booking/holds'
import { createFixture, startPendingBooking, type Fixture } from './fixtures'
import { insertPaidBooking } from './fixtures'

const RANGE = { startsOn: '2031-11-03', endsOn: '2031-11-06' }

/** A booking whose bikes were freed (`expired`) although its session was then paid: the case that should never happen. */
describe('a payment that arrives after the bikes were freed', () => {
  let fx: Fixture
  let gateway: FakeGateway
  const extra: Fixture[] = []
  beforeEach(async () => { fx = await createFixture(2); gateway = new FakeGateway(new Map(), new Map()) })
  afterEach(async () => { await fx.cleanup(); for (const e of extra.splice(0)) await e.cleanup() })

  const bookingOf = async (id: string) => (await db.select().from(bookings).where(eq(bookings.id, id)))[0]
  const linesOf = (id: string) => db.select().from(bikeReservations).where(eq(bikeReservations.bookingId, id))
  const refundsOf = (id: string) => db.select().from(bookingRefunds).where(eq(bookingRefunds.bookingId, id))

  async function paidButExpired(lineCount: number) {
    const pending = await startPendingBooking(fx, gateway, RANGE, lineCount)
    gateway.pay(pending.sessionId)          // the money arrived...
    await expireBooking(pending.bookingId)  // ...but the bikes had been given up
    return pending
  }

  it('gives the bikes back when they are still free: the booking is confirmed with new held-then-confirmed bikes', async () => {
    const pending = await paidButExpired(2)
    const result = await confirmBooking(pending.bookingId, gateway)
    expect(result).toEqual({ status: 'reassigned', bookingId: pending.bookingId })
    expect((await bookingOf(pending.bookingId)).status).toBe('confirmed')
    const confirmed = (await linesOf(pending.bookingId)).filter((line) => line.status === 'confirmed')
    expect(confirmed).toHaveLength(2)
    expect(new Set(confirmed.map((line) => line.bikeUnitId)).size).toBe(2)
    expect(gateway.refundCount()).toBe(0)
  })

  it('refunds everything and marks the booking failed_refunded when the bikes were taken meanwhile', async () => {
    const pending = await paidButExpired(2)
    // somebody else took both bikes in the meantime
    const thief = await insertPaidBooking(fx, RANGE, [1000, 1000])
    expect(thief.reservationIds).toHaveLength(2)
    const result = await confirmBooking(pending.bookingId, gateway)
    expect(result).toEqual({ status: 'refunded', bookingId: pending.bookingId })
    expect((await bookingOf(pending.bookingId)).status).toBe('failed_refunded')
    const refunds = await refundsOf(pending.bookingId)
    expect(refunds).toHaveLength(2)
    expect(refunds.every((refund) => refund.reason === 'late_payment' && refund.status === 'succeeded' && refund.createdBy === null)).toBe(true)
    expect(refunds.reduce((sum, refund) => sum + refund.amountCents, 0)).toBe(6000)
    // nothing of the failed attempt keeps the bikes blocked
    expect((await linesOf(pending.bookingId)).every((line) => line.status === 'expired')).toBe(true)
  })

  it('asks again and finishes when a refund failed: it never sells the bikes after it started giving the money back', async () => {
    const pending = await paidButExpired(2)
    await insertPaidBooking(fx, RANGE, [1000, 1000])
    gateway.failNextRefund = true
    const first = await confirmBooking(pending.bookingId, gateway)
    expect(first).toEqual({ status: 'refund_failed', bookingId: pending.bookingId })
    expect((await bookingOf(pending.bookingId)).status).toBe('expired')
    // the thief's bikes are cancelled meanwhile: the bikes are free again, but the money is already on its way back
    await db.update(bikeReservations).set({ status: 'cancelled' }).where(eq(bikeReservations.customerId, fx.customerId))
    const second = await confirmBooking(pending.bookingId, gateway)
    expect(second).toEqual({ status: 'refunded', bookingId: pending.bookingId })
    expect((await bookingOf(pending.bookingId)).status).toBe('failed_refunded')
    expect(gateway.refundCount()).toBe(2)
  })

  it('refunds when the customer already has another payment on its way (one at a time)', async () => {
    const pending = await paidButExpired(1)
    await startPendingBooking(fx, gateway, { startsOn: '2032-01-10', endsOn: '2032-01-12' }, 1) // another pending booking
    const result = await confirmBooking(pending.bookingId, gateway)
    expect(result.status).toBe('reassigned') // the dates are free, but reviving is refused...
  })
})
```

> **Nota per chi esegue.** L'ultimo test descrive la regola «un solo pagamento in attesa per cliente» applicata alla riattivazione: `reviveBooking` ritorna `false` quando esiste già una testata `pending` dello stesso cliente (indice unico). In quel caso la funzione **deve** passare al rimborso, non riassegnare. Scrivi l'asserzione corretta **prima** di implementare: `expect(result.status).toBe('refunded')`, e verifica che la prima versione del test (con `reassigned`) sia quella sbagliata. Se non lo correggi, il test passa per la ragione sbagliata.

- [ ] **Step 2: Correggi l'ultimo test come dice la nota** e verifica che l'insieme fallisca

Sostituisci l'ultima asserzione con `expect(result.status).toBe('refunded')` e, dopo, `expect(gateway.refundCount()).toBe(1)`.
Run: `npm run test:db -- tests/db/late-payment.test.ts`
Expected: FAIL («late payment ... not written yet»).

- [ ] **Step 3: Implementa**

`lib/booking/late-payment.ts` (sostituisce il segnaposto):

```ts
import { and, eq } from 'drizzle-orm'
import { db, bikeReservations, bikeUnits, bookingRefunds, bookings, type Booking } from '@/lib/db'
import type { ConfirmResult } from './confirm'
import { confirmHold, expireBooking, findBooking, holdOneBike, reviveBooking } from './holds'
import type { PaymentGateway } from './payments/gateway'
import { issueRefund } from './refunds'
import { safeErrorSummary } from '@/lib/safe-error'

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
  return db
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
    .then((rows) => rows.map((row) => ({ ...row, amountCents: row.amountCents ?? 0 })))
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
```

- [ ] **Step 4: Verifica** — `npm run test:db -- tests/db/late-payment.test.ts tests/db/confirm.test.ts && npx tsc --noEmit`
Expected: tutti passano. Se il test «refunds everything» vede `reassigned`, `insertPaidBooking` del «ladro» non occupa le stesse bici: controlla che usi `fx.unitIds[0..1]` (sì, per costruzione) e che le date coincidano con `RANGE`.

- [ ] **Step 5: Commit**

```bash
git add lib/booking/late-payment.ts tests/db/late-payment.test.ts
git commit -m "Late payment: give the bikes back if they are free, otherwise refund everything; never keep money without a bike"
```

---

### Task 8: Far scadere un posto senza vendere due volte una bici pagata

**Files:**
- Create: `lib/booking/settle.ts`
- Test: `tests/db/settle.test.ts`

**Interfaces:**
- Consumes: `findBooking`, `expireBooking`, `findOverduePending` (`holds.ts`); `confirmBooking` (Task 6); `PaymentGateway`.
- Produces: `settleHold(bookingId: string, gateway?: PaymentGateway): Promise<SettleResult>` con `SettleResult = 'expired' | 'confirmed' | 'closed' | 'still_open'`; `settleOverdueHolds(gateway?: PaymentGateway): Promise<{ settled: number; failed: number }>`.

- [ ] **Step 1: Scrivi il test (deve fallire)**

`tests/db/settle.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { db, bikeReservations, bookings } from '@/lib/db'
import { FakeGateway } from '@/lib/booking/payments/fake'
import { settleHold, settleOverdueHolds } from '@/lib/booking/settle'
import { getFreeBikes } from '@/lib/booking/availability'
import { createFixture, insertBooking, startPendingBooking, type Fixture } from './fixtures'

const RANGE = { startsOn: '2031-11-03', endsOn: '2031-11-06' }

describe('settling a held booking', () => {
  let fx: Fixture
  let gateway: FakeGateway
  beforeEach(async () => { fx = await createFixture(3); gateway = new FakeGateway(new Map(), new Map()) })
  afterEach(async () => { await fx.cleanup() })

  const bookingOf = async (id: string) => (await db.select().from(bookings).where(eq(bookings.id, id)))[0]
  const free = async () => (await getFreeBikes(RANGE, { publishedOnly: false })).find((r) => r.bikeModelId === fx.modelId)?.free ?? 0
  const makeOverdue = (id: string) =>
    db.update(bookings).set({ holdExpiresAt: sql`now() - interval '1 minute'` }).where(eq(bookings.id, id))

  it('closes the session first, and only then frees the bikes', async () => {
    const pending = await startPendingBooking(fx, gateway, RANGE, 2)
    expect(await free()).toBe(1)
    expect(await settleHold(pending.bookingId, gateway)).toBe('expired')
    expect(await gateway.getSession(pending.sessionId)).toEqual({ status: 'expired' })
    expect((await bookingOf(pending.bookingId)).status).toBe('expired')
    expect(await free()).toBe(3)
  })

  it('if the customer paid in the meantime, it confirms instead of freeing: a paid bike is never given to somebody else', async () => {
    const pending = await startPendingBooking(fx, gateway, RANGE, 2)
    gateway.pay(pending.sessionId)
    expect(await settleHold(pending.bookingId, gateway)).toBe('confirmed')
    expect((await bookingOf(pending.bookingId)).status).toBe('confirmed')
    expect(await free()).toBe(1)
  })

  it('frees the bikes of a session that had already expired by itself', async () => {
    const pending = await startPendingBooking(fx, gateway, RANGE, 1)
    await gateway.expireSession(pending.sessionId)
    expect(await settleHold(pending.bookingId, gateway)).toBe('expired')
    expect(await free()).toBe(3)
  })

  it('frees a booking that never got a session (the process died between the hold and the session)', async () => {
    const bare = await insertBooking(fx.customerId, RANGE) // pending, no session id
    expect(await settleHold(bare, gateway)).toBe('expired')
    expect((await bookingOf(bare)).status).toBe('expired')
  })

  it('does nothing to a booking that is not pending any more, or that does not exist', async () => {
    const pending = await startPendingBooking(fx, gateway, RANGE, 1)
    gateway.pay(pending.sessionId)
    await settleHold(pending.bookingId, gateway)
    expect(await settleHold(pending.bookingId, gateway)).toBe('closed')
    expect(await settleHold(crypto.randomUUID(), gateway)).toBe('closed')
  })

  it('payment and settlement at the same time: the bikes end up confirmed or freed, never both, never half', async () => {
    for (let round = 0; round < 6; round++) {
      const pending = await startPendingBooking(fx, gateway, RANGE, 2)
      const [, result] = await Promise.all([Promise.resolve().then(() => gateway.pay(pending.sessionId)), settleHold(pending.bookingId, gateway)])
      const booking = await bookingOf(pending.bookingId)
      const lines = await db.select().from(bikeReservations).where(eq(bikeReservations.bookingId, pending.bookingId))
      const states = [...new Set(lines.map((line) => line.status))]
      if (booking.status === 'confirmed') {
        expect(result).toBe('confirmed')
        expect(states).toEqual(['confirmed'])
      } else {
        // the session was closed before the card: the customer cannot pay it any more
        expect(booking.status).toBe('expired')
        expect(states).toEqual(['expired'])
        expect((await gateway.getSession(pending.sessionId)).status).toBe('expired')
      }
      await db.delete(bikeReservations).where(eq(bikeReservations.bookingId, pending.bookingId))
      await db.delete(bookings).where(eq(bookings.id, pending.bookingId))
    }
  })

  describe('the sweeper', () => {
    it('settles the bookings whose time has run out and leaves the others', async () => {
      const late = await startPendingBooking(fx, gateway, RANGE, 1)
      const [other] = [await createFixture(1)]
      try {
        const fresh = await startPendingBooking(other, gateway, RANGE, 1)
        await makeOverdue(late.bookingId)
        const swept = await settleOverdueHolds(gateway)
        expect(swept.failed).toBe(0)
        expect(swept.settled).toBeGreaterThanOrEqual(1)
        expect((await bookingOf(late.bookingId)).status).toBe('expired')
        expect((await bookingOf(fresh.bookingId)).status).toBe('pending')
      } finally { await other.cleanup() }
    })

    it('settles an overdue booking that was paid: it confirms it', async () => {
      const paid = await startPendingBooking(fx, gateway, RANGE, 1)
      gateway.pay(paid.sessionId)
      await makeOverdue(paid.bookingId)
      await settleOverdueHolds(gateway)
      expect((await bookingOf(paid.bookingId)).status).toBe('confirmed')
    })

    it('one booking that fails does not stop the others', async () => {
      const bad = await startPendingBooking(fx, gateway, RANGE, 1)
      const good = await createFixture(1)
      try {
        const fine = await startPendingBooking(good, gateway, RANGE, 1)
        await makeOverdue(bad.bookingId)
        await makeOverdue(fine.bookingId)
        const broken = new FakeGateway(new Map(), new Map())
        const real = gateway.expireSession.bind(gateway)
        broken.expireSession = async (id: string) => { if (id === bad.sessionId) throw new Error('gateway down'); return real(id) }
        broken.getSession = gateway.getSession.bind(gateway)
        const swept = await settleOverdueHolds(broken)
        expect(swept.failed).toBe(1)
        expect((await bookingOf(bad.bookingId)).status).toBe('pending')
        expect((await bookingOf(fine.bookingId)).status).toBe('expired')
      } finally { await good.cleanup() }
    })
  })
})
```

- [ ] **Step 2: Verifica che fallisca** — `npm run test:db -- tests/db/settle.test.ts` → FAIL (modulo mancante).

- [ ] **Step 3: Implementa**

`lib/booking/settle.ts`:

```ts
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
```

- [ ] **Step 4: Verifica** — `npm run test:db -- tests/db/settle.test.ts && npx tsc --noEmit`
Expected: tutti passano, compreso il test di concorrenza (6 giri).

- [ ] **Step 5: Commit**

```bash
git add lib/booking/settle.ts tests/db/settle.test.ts
git commit -m "Settle a hold: close the payment session before freeing the bikes, and confirm a booking that was paid in the meantime"
```

---

### Task 9: Iniziare un pagamento

**Files:**
- Create: `lib/booking/checkout.ts`
- Test: `tests/db/checkout.test.ts`

**Interfaces:**
- Consumes: `cartSchema`, `expandCart`, `checkStay` (3a); `quoteBikes` (Task 4); `startHold`, `expireBooking`, `findBooking` (`holds.ts`); `settleHold` (Task 8); `getPaymentGateway`, `PaymentsNotConfiguredError`, `PaymentGateway`.
- Produces: `beginCheckout(input: BeginCheckoutInput, gateway?: PaymentGateway): Promise<BeginCheckoutResult>`, con
  `BeginCheckoutInput = { bookingKey: string; customerId: string; customerEmail: string; language: string; startsOn: IsoDate; endsOn: IsoDate; cart: unknown; today: IsoDate; urls: (bookingId: string) => { successUrl: string; cancelUrl: string } }` e
  `BeginCheckoutResult = { status: 'redirect'; bookingId: string; url: string; holdExpiresAt: Date } | { status: 'already_paid'; bookingId: string } | { status: 'invalid'; reason: 'cart' | 'invalid_date' | 'not_a_range' | 'too_soon' | 'too_far' } | { status: 'unknown_bike' | 'bike_unavailable'; lineIndex: number } | { status: 'too_many_days'; lineIndex: number; maxDays: number } | { status: 'has_pending'; bookingId: string } | { status: 'in_progress'; bookingId: string } | { status: 'closed'; bookingId: string; bookingStatus: string } | { status: 'too_many_attempts' } | { status: 'try_again' } | { status: 'payments_unavailable' }`.

- [ ] **Step 1: Scrivi il test (deve fallire)**

`tests/db/checkout.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, bikeCategories, bikeModels, bikeReservations, bookings } from '@/lib/db'
import { FakeGateway } from '@/lib/booking/payments/fake'
import { beginCheckout, type BeginCheckoutInput } from '@/lib/booking/checkout'
import { getFreeBikes } from '@/lib/booking/availability'
import { createFixture, type Fixture } from './fixtures'

const TODAY = '2031-10-01'
const STAY = { startsOn: '2031-11-03', endsOn: '2031-11-06' } // 3 days

describe('beginCheckout', () => {
  let fx: Fixture
  let gateway: FakeGateway
  beforeEach(async () => {
    fx = await createFixture(3)
    gateway = new FakeGateway(new Map(), new Map())
    const [model] = await db.select().from(bikeModels).where(eq(bikeModels.id, fx.modelId))
    await db.update(bikeCategories).set({ day1Price: '10', day2Price: '18', day3Price: '24', maxRentalDays: 3 })
      .where(eq(bikeCategories.id, model.categoryId))
    await db.update(bikeModels).set({ isPublished: true }).where(eq(bikeModels.id, fx.modelId))
  })
  afterEach(async () => { vi.unstubAllEnvs(); await fx.cleanup() })

  const cart = (quantity: number) => [{ bikeModelId: fx.modelId, bikeSizeId: fx.sizeId, bikeVersionId: fx.versionId, quantity }]
  const request = (overrides: Partial<BeginCheckoutInput> = {}): BeginCheckoutInput => ({
    bookingKey: crypto.randomUUID(), customerId: fx.customerId, customerEmail: 'db-test@example.test', language: 'it',
    ...STAY, cart: cart(1), today: TODAY,
    urls: (bookingId) => ({ successUrl: `https://example.test/ok/${bookingId}`, cancelUrl: `https://example.test/back/${bookingId}` }),
    ...overrides,
  })
  const free = async () => (await getFreeBikes(STAY, { publishedOnly: false })).find((r) => r.bikeModelId === fx.modelId)?.free ?? 0
  const bookingOf = async (id: string) => (await db.select().from(bookings).where(eq(bookings.id, id)))[0]
  const mine = () => db.select().from(bookings).where(eq(bookings.customerId, fx.customerId))

  it('holds the bikes, opens a payment session for the server\'s price and sends the customer to it', async () => {
    const result = await beginCheckout(request({ cart: cart(2) }), gateway)
    if (result.status !== 'redirect') throw new Error(`expected redirect, got ${result.status}`)
    expect(result.url).toMatch(/^\/it\/rent\/fake-checkout\/fake_cs_/)
    expect(await free()).toBe(1)
    const booking = await bookingOf(result.bookingId)
    expect(booking).toMatchObject({ status: 'pending', totalCents: 4800, stripeSessionId: result.url.split('/').pop() })
    const session = gateway.describe(booking.stripeSessionId!)
    expect(session?.lines).toHaveLength(2)
    expect(session?.lines.every((line) => line.amountCents === 2400)).toBe(true)
    expect(session?.successUrl).toBe(`https://example.test/ok/${result.bookingId}`)
    expect(session?.cancelUrl).toBe(`https://example.test/back/${result.bookingId}`)
  })

  it('checks the request itself, before touching anything', async () => {
    expect(await beginCheckout(request({ cart: [] }), gateway)).toEqual({ status: 'invalid', reason: 'cart' })
    expect(await beginCheckout(request({ cart: cart(11) }), gateway)).toEqual({ status: 'invalid', reason: 'cart' })
    expect(await beginCheckout(request({ startsOn: TODAY, endsOn: '2031-10-03' }), gateway)).toEqual({ status: 'invalid', reason: 'too_soon' })
    expect(await beginCheckout(request({ startsOn: '2032-12-01', endsOn: '2032-12-03' }), gateway)).toEqual({ status: 'invalid', reason: 'too_far' })
    expect(await beginCheckout(request({ startsOn: '2031-11-06', endsOn: '2031-11-03' }), gateway)).toEqual({ status: 'invalid', reason: 'not_a_range' })
    expect(await mine()).toHaveLength(0)
    expect(gateway.sessionCount()).toBe(0)
  })

  it('names the line the category cannot rent for that long, and holds nothing', async () => {
    const result = await beginCheckout(request({ startsOn: '2031-11-03', endsOn: '2031-11-08' }), gateway) // 5 days, max 3
    expect(result).toEqual({ status: 'too_many_days', lineIndex: 0, maxDays: 3 })
    expect(await mine()).toHaveLength(0)
  })

  it('says which line has no bike left, frees the others and leaves nothing pending', async () => {
    const result = await beginCheckout(request({ cart: cart(4) }), gateway) // 3 bikes in the fixture
    expect(result).toEqual({ status: 'bike_unavailable', lineIndex: 3 })
    expect(await free()).toBe(3)
    expect((await mine()).filter((b) => b.status === 'pending')).toHaveLength(0)
    expect(gateway.sessionCount()).toBe(0)
  })

  it('asking again with the same key goes to the same payment page: no second booking, no second session', async () => {
    const same = request()
    const first = await beginCheckout(same, gateway)
    const second = await beginCheckout(same, gateway)
    if (first.status !== 'redirect' || second.status !== 'redirect') throw new Error('expected redirect twice')
    expect(second.bookingId).toBe(first.bookingId)
    expect(second.url).toBe(first.url)
    expect(gateway.sessionCount()).toBe(1)
    expect(await mine()).toHaveLength(1)
  })

  it('asking again after the customer has paid says it is paid', async () => {
    const same = request()
    const first = await beginCheckout(same, gateway)
    if (first.status !== 'redirect') throw new Error('setup')
    gateway.pay(first.url.split('/').pop()!)
    expect(await beginCheckout(same, gateway)).toEqual({ status: 'already_paid', bookingId: first.bookingId })
  })

  it('a new request while another payment is open ends the old one and starts the new: the customer is never stuck', async () => {
    const first = await beginCheckout(request(), gateway)
    if (first.status !== 'redirect') throw new Error('setup')
    const second = await beginCheckout(request({ cart: cart(2) }), gateway)
    if (second.status !== 'redirect') throw new Error(`expected redirect, got ${second.status}`)
    expect((await bookingOf(first.bookingId)).status).toBe('expired')
    expect(await gateway.getSession(first.url.split('/').pop()!)).toEqual({ status: 'expired' })
    expect((await bookingOf(second.bookingId)).status).toBe('pending')
    expect(await free()).toBe(1) // only the two bikes of the new booking are held
  })

  it('a new request while the previous payment was already made confirms the old one and starts the new', async () => {
    const first = await beginCheckout(request(), gateway)
    if (first.status !== 'redirect') throw new Error('setup')
    gateway.pay(first.url.split('/').pop()!)
    const second = await beginCheckout(request(), gateway)
    expect(second.status).toBe('redirect')
    expect((await bookingOf(first.bookingId)).status).toBe('confirmed')
  })

  it('two tabs of the same customer at once, with two different keys: one wins, the other is told, only one set of bikes is held', async () => {
    const results = await Promise.all([beginCheckout(request({ cart: cart(1) }), gateway), beginCheckout(request({ cart: cart(2) }), gateway)])
    const redirects = results.filter((r) => r.status === 'redirect')
    expect(redirects).toHaveLength(1)
    expect(results.map((r) => r.status).filter((s) => s !== 'redirect')).toHaveLength(1)
    expect((await mine()).filter((b) => b.status === 'pending')).toHaveLength(1)
    const held = (await db.select().from(bikeReservations).where(eq(bikeReservations.customerId, fx.customerId))).filter((l) => l.status === 'held')
    const winner = redirects[0]
    if (winner.status !== 'redirect') throw new Error('unreachable')
    expect(held.every((line) => line.bookingId === winner.bookingId)).toBe(true)
  })

  it('in production without Stripe it holds nothing and says payments are not available', async () => {
    vi.stubEnv('APP_ENV', 'production')
    expect(await beginCheckout(request())).toEqual({ status: 'payments_unavailable' }) // no gateway passed: the factory refuses
    expect(await mine()).toHaveLength(0)
    expect(await free()).toBe(3)
  })

  it('frees the bikes and gives the error back when the gateway cannot open a session', async () => {
    const broken = new FakeGateway(new Map(), new Map())
    broken.createSession = async () => { throw new Error('gateway down') }
    await expect(beginCheckout(request(), broken)).rejects.toThrow('gateway down')
    expect(await free()).toBe(3)
    expect((await mine()).filter((b) => b.status === 'pending')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Verifica che fallisca** — `npm run test:db -- tests/db/checkout.test.ts` → FAIL (modulo mancante).

- [ ] **Step 3: Implementa**

`lib/booking/checkout.ts`:

```ts
import { eq, and } from 'drizzle-orm'
import { db, bookings } from '@/lib/db'
import type { IsoDate } from '@/lib/dates'
import { expireBooking, findBooking, startHold, type StartHoldResult } from './holds'
import { getPaymentGateway, PaymentsNotConfiguredError } from './payments'
import type { PaymentGateway } from './payments/gateway'
import { quoteBikes } from './quote'
import { cartSchema, checkStay, expandCart } from './rules'
import { settleHold } from './settle'

export interface BeginCheckoutInput {
  /** The idempotency key of the whole booking, made when the person opened the page. */
  bookingKey: string
  customerId: string
  customerEmail: string
  language: string
  startsOn: IsoDate
  endsOn: IsoDate
  /** Not trusted: parsed here. */
  cart: unknown
  /** Today in Rome, passed in so the rules are testable. */
  today: IsoDate
  /** Where the payment page sends the person back to; the booking id is known only here. */
  urls: (bookingId: string) => { successUrl: string; cancelUrl: string }
}

export type BeginCheckoutResult =
  | { status: 'redirect'; bookingId: string; url: string; holdExpiresAt: Date }
  | { status: 'already_paid'; bookingId: string }
  | { status: 'invalid'; reason: 'cart' | 'invalid_date' | 'not_a_range' | 'too_soon' | 'too_far' }
  | { status: 'unknown_bike' | 'bike_unavailable'; lineIndex: number }
  | { status: 'too_many_days'; lineIndex: number; maxDays: number }
  | { status: 'has_pending'; bookingId: string }
  | { status: 'in_progress'; bookingId: string }
  | { status: 'closed'; bookingId: string; bookingStatus: string }
  | { status: 'too_many_attempts' }
  | { status: 'try_again' }
  | { status: 'payments_unavailable' }

/**
 * From "pay" to the payment page: check the request, price it on the server, hold the bikes, open a payment session and say where to
 * send the person. Everything is decided here, on the server, from the request and the catalogue; the browser only chose what to ask for.
 * If anything fails after the bikes are held they are freed; if the person already has another payment open, it is ended first (the
 * session closed, or confirmed if it was paid) so they are never stuck behind their own earlier attempt.
 */
export async function beginCheckout(input: BeginCheckoutInput, gateway?: PaymentGateway): Promise<BeginCheckoutResult> {
  const cart = cartSchema.safeParse(input.cart)
  if (!cart.success) return { status: 'invalid', reason: 'cart' }
  const stay = checkStay(input.startsOn, input.endsOn, input.today)
  if (!stay.ok) return { status: 'invalid', reason: stay.reason }

  // Before any bike is held: without a way to pay there is nothing to hold them for.
  let payments: PaymentGateway
  try {
    payments = gateway ?? getPaymentGateway()
  } catch (error) {
    if (error instanceof PaymentsNotConfiguredError) return { status: 'payments_unavailable' }
    throw error
  }

  const quote = await quoteBikes(expandCart(cart.data), stay.days, { language: input.language })
  if (quote.status !== 'ok') return quote

  const hold = await holdLinesOf(input, quote.lines, payments)
  if (hold.status === 'unavailable') return { status: 'bike_unavailable', lineIndex: hold.lineIndex }
  if (hold.status === 'try_again') return { status: 'try_again' }
  if (hold.status !== 'held') return hold

  // The same key again: the booking already exists, and so may its payment session.
  const existing = await findBooking(hold.bookingId)
  if (existing?.stripeSessionId) {
    const session = await payments.getSession(existing.stripeSessionId)
    if (session.status === 'open') return { status: 'redirect', bookingId: hold.bookingId, url: session.url, holdExpiresAt: hold.holdExpiresAt }
    if (session.status === 'paid') return { status: 'already_paid', bookingId: hold.bookingId }
    return { status: 'closed', bookingId: hold.bookingId, bookingStatus: existing.status }
  }

  let session
  try {
    session = await payments.createSession({
      bookingId: hold.bookingId,
      bookingKey: input.bookingKey,
      customerEmail: input.customerEmail,
      language: input.language,
      lines: quote.lines.map((line) => ({ label: line.label, amountCents: line.amountCents })),
      expiresAt: hold.holdExpiresAt,
      ...input.urls(hold.bookingId),
    })
  } catch (error) {
    await expireBooking(hold.bookingId)
    throw error
  }

  const saved = await db.update(bookings).set({ stripeSessionId: session.id })
    .where(and(eq(bookings.id, hold.bookingId), eq(bookings.status, 'pending'))).returning({ id: bookings.id })
  if (saved.length === 0) {
    // Somebody ended this booking while the session was being opened (the customer started another one): do not leave it payable.
    await payments.expireSession(session.id)
    const now = await findBooking(hold.bookingId)
    return { status: 'closed', bookingId: hold.bookingId, bookingStatus: now?.status ?? 'expired' }
  }
  return { status: 'redirect', bookingId: hold.bookingId, url: session.url, holdExpiresAt: hold.holdExpiresAt }
}

type HoldResult = StartHoldResult | { status: 'unavailable'; lineIndex: number }

/** Holds the bikes; if the customer has another payment open, ends it (once) and tries again. */
async function holdLinesOf(
  input: BeginCheckoutInput, lines: { bikeModelId: string; bikeSizeId: string; bikeVersionId: string; amountCents: number }[],
  payments: PaymentGateway,
): Promise<HoldResult> {
  const hold = () => startHold({
    bookingKey: input.bookingKey, customerId: input.customerId, startsOn: input.startsOn, endsOn: input.endsOn,
    language: input.language, lines,
  })
  const first = await hold()
  if (first.status !== 'has_pending') return first
  await settleHold(first.bookingId, payments)
  return hold()
}
```

- [ ] **Step 4: Verifica** — `npm run test:db -- tests/db/checkout.test.ts && npx tsc --noEmit`
Expected: i 11 test passano. Se «two tabs» dà due `redirect`, l'indice unico della 3a (migrazione 0020) non è applicato al database di sviluppo: `npm run db:migrate`. Se dà `has_pending` e `redirect` va benissimo; se dà `closed` e `redirect`, anche.

- [ ] **Step 5: Commit**

```bash
git add lib/booking/checkout.ts tests/db/checkout.test.ts
git commit -m "Begin a checkout: price on the server, hold the bikes, open a payment session, and never leave a customer stuck behind their own attempt"
```

---

### Task 10: Privacy, documenti e prova finale

**Files:**
- Modify: `lib/auth/account-data.ts` (i rimborsi nell'esportazione), `tests/db/account-data.test.ts`, `docs/ai/STATE.md`, `docs/ai/ROADMAP.md`
- Test: l'intera suite

**Interfaces:**
- Consumes: `bookingRefunds`.
- Produces: `buildAccountExport` aggiunge `refunds: { amount: number; status; reason; createdAt: string }[]`.

- [ ] **Step 1: Scrivi il test (deve fallire)**

In `tests/db/account-data.test.ts`, nel `describe('buildAccountExport'...)` (o in coda al file, con gli stessi helper `customerOf`), aggiungi:

```ts
  it('includes the refunds of the customer, in euros, without internal ids', async () => {
    const userId = randomUUID()
    const customer = await customerOf(userId)
    const fixture = await createFixture(1)
    fixtures.push(fixture)
    const range = { startsOn: '2031-12-01', endsOn: '2031-12-03' }
    const booking = await insertBooking(customer.id, range, { status: 'confirmed', totalCents: 4500 })
    const line = await insertOnlineLine(booking, customer.id, fixture.unitIds[0], range, 'cancelled', 4500)
    await db.insert(bookingRefunds).values({ reservationId: line, bookingId: booking, amountCents: 4500, reason: 'customer', status: 'succeeded' })
    const data = await buildAccountExport({ id: userId, email: 'x@example.test', created_at: '2031-01-01', identities: [] } as unknown as User)
    expect(data.refunds).toEqual([{ amount: 45, status: 'succeeded', reason: 'customer', createdAt: expect.any(String) }])
  })
```

Aggiungi `bookingRefunds` all'import da `@/lib/db`, e nell'`afterEach` cancella i rimborsi **prima** delle prenotazioni: `await db.delete(bookingRefunds).where(inArray(bookingRefunds.bookingId, db.select({ id: bookings.id }).from(bookings).where(inArray(bookings.customerId, ids))))`.

- [ ] **Step 2: Verifica che fallisca** — `npm run test:db -- tests/db/account-data.test.ts` → FAIL (`refunds` non esiste).

- [ ] **Step 3: Implementa**

In `lib/auth/account-data.ts`, importa `bookingRefunds` e, dopo `bookingRows`:

```ts
  const refundRows = customer
    ? await db.select({
        amountCents: bookingRefunds.amountCents,
        status: bookingRefunds.status,
        reason: bookingRefunds.reason,
        createdAt: bookingRefunds.createdAt,
      }).from(bookingRefunds).innerJoin(bookings, eq(bookings.id, bookingRefunds.bookingId)).where(eq(bookings.customerId, customer.id))
    : []
```

e nell'oggetto restituito, dopo `bookings`:

```ts
    refunds: refundRows.map((refund) => ({
      amount: refund.amountCents / 100,
      status: refund.status,
      reason: refund.reason,
      createdAt: refund.createdAt.toISOString(),
    })),
```

- [ ] **Step 4: Aggiorna i documenti**

- `docs/ai/STATE.md`, nel paragrafo delle prenotazioni: una frase che dice che esiste `lib/booking/payments/` (contratto, finta solo fuori produzione, fabbrica che in produzione rifiuta; guardia `fake-guard.test.ts`), che `settleHold` è l'unico modo di liberare una bici tenuta quando c'è un pagamento, e che il pagamento tardivo prima riassegna e poi rimborsa. **Entra solo ciò che il codice non dice già**: il *perché* del divieto di liberare a tempo e la regola «mai tenere soldi senza una bici».
- `docs/ai/ROADMAP.md`: nella riga della fetta 3, «3b fatta su `staging`»; restano 3c (pagina `/rent`, Account rents, azioni del pannello, la pagina finta di pagamento, il lavoro del worker che chiama `settleOverdueHolds`, i termini) e 3d (Stripe vero: `StripeGateway`, `stripe_events`, la rotta `POST /api/stripe/webhook`, `expires_at` ≥ 31 minuti, saldo per i rimborsi).
- Elenca per la 3c che `cancelOnlineReservation` **non** pianifica la sincronizzazione con Google Calendar: lo fa la Server Action con `after()` (`scheduleCalendarSync`), come per il banco.

- [ ] **Step 5: Prova finale e confronto**

Run, in questo ordine:

```bash
npx tsc --noEmit
npm test
npm run test:db
npm run lint
```

Expected: tipi puliti; test unitari verdi; test del database verdi (compresi i nuovi: `booking-refunds`, `quote`, `refunds`, `confirm`, `late-payment`, `settle`, `checkout`); `lint` senza errori.

- [ ] **Step 6: Commit**

```bash
git add lib/auth tests/db docs
git commit -m "Privacy and docs for slice 3b: the refunds in the data export, and the rules that are not in the code"
```

- [ ] **Step 7: Revisione finale e PR**

Fai rivedere l'intero ramo a un revisore indipendente (l'intero diff `origin/staging..HEAD`), con questi punti da cercare in particolare: ogni punto della sezione **Review Focus**; passi che dovrebbero essere un solo statement e non lo sono; qualunque percorso che libera una bici `held` senza passare da `settleHold`/`expireBooking`; qualunque import della finta fuori da `payments/index.ts`. Correggi Critical e Important con un test che prima fallisce. Poi `git push -u origin feat/booking-3b-payment-core` e una PR **verso `staging`**: non unire prima che `verify`, `browser` e `CodeQL` siano verdi sullo stesso commit, senza attenderli attivamente.

---

## Self-review

**Copertura della spec.**
- «Una porta per il pagamento (avviare, confermare, far scadere, rimborsare)», finta solo fuori dalla produzione, in produzione senza Stripe si rifiuta, un test lo fissa → Task 1 (`gateway`, `fake`, fabbrica, due file di test) e Task 9 (`payments_unavailable` senza tenere bici).
- Iniziare il pagamento (controlli, una sola prenotazione in attesa che ne termina un'altra, prezzi dal listino, tenere le bici, creare la sessione, salvarne l'id, ripulire se fallisce) → Task 9 con Task 4 e `settleHold` del Task 8. Il passo 6 della spec (`cancel_url` che chiude la sessione prima di liberare) è `settleHold(bookingId)` richiamato dalla **Server Action** del Task 3c: il motore c'è, il collegamento è nella 3c.
- Confermare in modo idempotente e concorrente → Task 6.
- Scadere senza mai vendere due volte una bici pagata, con il lavoro periodico e la disponibilità a richiesta → Task 8 (`settleHold`, `settleOverdueHolds`); il **lavoro del worker** che lo chiama ogni minuto e la chiamata a richiesta dalla disponibilità sono nella 3c, perché dipendono dalla pagina.
- Pagamento tardivo: riassegna, altrimenti rimborsa tutto e `failed_refunded` → Task 7. «Avvisa Kevin» è un errore nel log fino alla fetta 4 (email): è nel testo del Task 7 e nel Task 10.
- Annullare una bici con rimborso, termine, un rimborso per bici, somma ≤ totale, staff intero/parziale/niente → Task 3 e Task 5.
- `booking_refunds` → Task 2. **`stripe_events` non c'è**: è del webhook, 3d.
- Privacy: nessun dato di persone nei log (`safeErrorSummary`, solo id di prenotazione), rimborsi nell'esportazione → Task 7 e Task 10.

**Decisioni prese qui, da conoscere:**
- La tabella dei rimborsi dice `gateway_refund_id`, non `stripe_refund_id` come la spec: la tabella è neutra rispetto alla gateway (ci scrive anche la finta).
- La riassegnazione del pagamento tardivo **riattiva** la testata per cinque minuti (`reviveBooking`) e riusa `holdOneBike` + `confirmHold`: nessuna nuova logica di assegnazione. Se esiste già un'altra testata `pending` dello stesso cliente la riattivazione è rifiutata e si rimborsa.
- Dopo che un rimborso tardivo è iniziato, la testata **non si riattiva più**, anche se nel frattempo le bici si liberano: i soldi stanno già tornando.
- Il sweeper non riconcilia le sessioni pagate di testate **già `expired`**: le prende il webhook (che Stripe ritenta) o la pagina di ritorno. Non è un buco nuovo, ma va saputo.

**Scansione dei segnaposto.** Nessun «TBD»: il segnaposto di `late-payment.ts` nel Task 6 è dichiarato temporaneo, ha un corpo di sostituzione completo nel Task 7 e un divieto esplicito di finire in una PR.

**Coerenza dei tipi.** `ConfirmResult` è definito nel Task 6 e usato nei Task 7 e 8 con gli stessi nomi di stato (`confirmed`, `already_confirmed`, `not_paid`, `incomplete`, `reassigned`, `refunded`, `refund_failed`, `closed`, `unknown_booking`). `SessionState.open` ha `url` (Task 1) ed è letto in `beginCheckout` (Task 9). `RefundResult.refundRef` (Task 1) è ciò che `issueRefund` salva in `gatewayRefundId` (Task 5). `holdOneBike` è già esportata dalla 3a e il Task 7 la chiama con `{ bookingKey, customerId, startsOn, endsOn, language, lines: [] }`, un `StartHoldInput` valido.
