# Fetta 3a — dati, disponibilità, posti tenuti e scadenza (senza pagamento) — Piano di realizzazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un cliente può far **tenere** una o più bici per 30 minuti (senza pagare, per ora), il posto blocca la bici anche per il pannello, e il posto si può confermare o far scadere; tutto provato sul database di sviluppo.

**Architecture:** Nuovi valori di enum e una tabella `bookings` (la testata di un pagamento); il vincolo contro le sovrapposizioni ora vale per `confirmed` **e** `held`. Le funzioni nuove stanno in `lib/booking/` (regole e prezzi puri, disponibilità, posti tenuti); le funzioni esistenti di `lib/reservations.ts` si correggono per contare `held` come bici occupata. Ogni operazione è **una sola istruzione** (il client non ha transazioni: `max_pipeline: 0`) e il vincolo del database ha l'ultima parola.

**Tech Stack:** Next.js 16, Drizzle + postgres.js sul pooler di Supabase, `zod` 4, `date-fns` 4 + `@date-fns/tz` (`lib/dates.ts`), `vitest` (`npm test` per le funzioni pure, `npm run test:db` per il database di sviluppo).

**Spec:** `docs/superpowers/specs/2026-10-07-booking-slice3-online-booking-design.md` (sezioni «Dati», «Disponibilità e prezzo», «Iniziare il pagamento» punti 2–4, «Scadere»).

**Fuori da questo piano** (piani successivi, scritti con le interfacce vere che questo produce): Stripe, il webhook e `settleHold`; `booking_refunds` e `stripe_events`; Account rents; le azioni del pannello per rimborsare; la pagina `/rent`; i termini; l'informativa. **Nulla di tutto questo va in produzione senza Stripe, e nulla va in produzione da qui:** solo `staging`, e il rilascio lo decide Kevin.

## Global Constraints

- **Mai commit diretti su `main` o `staging`**: ramo `feat/booking-3a-holds`, PR verso `staging`. Prima di ogni commit, `git branch --show-current`.
- **Ogni operazione sul database è una sola istruzione**: niente `db.transaction` (il client è `max_pipeline: 0`; `lib/db/no-transactions.test.ts` lo fa rispettare). Un'operazione atomica è un'unica istruzione, una CTE lo è.
- **Niente SQL costruito a mano**: valori sempre come parametri dentro `sql` di Drizzle; mai `sql.raw`, `.unsafe()` o una stringa passata a `execute` (`lib/db/no-raw-sql.test.ts`).
- **Una migrazione per passo e mai due insieme**: un valore di enum aggiunto non si può usare nella transazione che lo aggiunge, e `npm run db:migrate` applica tutte le migrazioni mancanti in **una** transazione. La `0018` (valori di enum) si applica **da sola**, poi si genera la `0019`.
- **Date**: stringhe `'YYYY-MM-DD'` (`IsoDate`), mai `Date`; «oggi» solo con `todayInRome()`; `endsOn` è **esclusivo**.
- **Soldi in centesimi interi** (`lib/money.ts`), mai float.
- **Codice, commenti e identificatori in inglese**; testi dell'interfaccia non toccati in questo piano.
- **Librerie prima del custom**: `zod` per la validazione, `date-fns` per le date. Nessuna dipendenza nuova in questo piano.
- **Niente dati di persone nei log**: errori di query con `safeErrorSummary` (`lib/safe-error.ts`).
- **I test sul database girano solo sullo sviluppo** (`tests/db/setup.ts` rifiuta la produzione) e puliscono ciò che creano.
- **Niente feature flag nel file d'ambiente.**

## Review Focus

I cinque modi in cui questo codice può fare male a una persona, ognuno con il test che lo ferma:

1. **Doppio clic su «inizia a pagare»** (stessa `bookingKey`): una sola prenotazione, non due. → Task 7, test «replays».
2. **Due clienti per l'ultima bici**: ne passa esattamente uno, l'altro riceve «non disponibile». → Task 7, test «race for the last bike».
3. **Un carrello di 3 bici con 2 libere**: nessuna bici resta tenuta (tutto o niente) e si dice **quale riga** manca. → Task 7, test «all or nothing».
4. **Il pannello e il banco non vedono i posti tenuti**: un noleggio al banco assegnato a una bici che sta pagando, un trasferimento su di essa, un ritiro della bici con un pagamento in corso. → Task 3.
5. **Conferma e scadenza insieme**: mai una prenotazione `confirmed` con righe `expired` né il contrario. → Task 7, test «confirm and expire together».

Altri casi, per completezza: carrello vuoto o con più di 10 bici (Task 4), inizio oggi o nel passato e oltre 180 giorni (Task 4), un cliente con già un pagamento in corso e uno che ne ha abbandonati 5 in un'ora (Task 7), le righe `expired` e `cancelled` che non bloccano (Task 2, 3, 6).

## File Structure

| File | Responsabilità |
|---|---|
| `lib/db/schema.ts` (modifica) | enum `held`/`expired`/`online_rental`, enum `booking_status`, tabella `bookings`, `booking_id` su `bike_reservations` |
| `lib/db/migrations/0018_*.sql`, `0019_*.sql` (nuove) | i valori di enum; la tabella, la colonna, il vincolo con `held`, i CHECK, l'RLS |
| `lib/booking/rules.ts` (nuovo) | costanti, `checkStay`, `cartSchema`, `expandCart` — puro |
| `lib/booking/pricing.ts` (nuovo) | `stayPriceCents`, `sumCents` — puro |
| `lib/booking/occupancy.ts` (nuovo) | quali stati occupano una bici: `OCCUPYING_STATUSES`, `occupying()` |
| `lib/booking/availability.ts` (nuovo) | `getFreeBikes`: quante bici libere per modello, taglia e versione in un periodo |
| `lib/booking/holds.ts` (nuovo) | `startHold`, `confirmHold`, `expireBooking`, `findPendingBooking`, `findOverduePending` |
| `lib/reservations.ts` (modifica) | le funzioni esistenti contano anche `held`; `GridReservation.status` |
| `tests/db/fixtures.ts` (modifica) | helper per creare una prenotazione e le sue righe, e la pulizia |
| `tests/db/booking-schema.test.ts`, `occupancy.test.ts`, `availability.test.ts`, `holds.test.ts` (nuovi) | le prove sul database |
| `lib/booking/rules.test.ts`, `pricing.test.ts` (nuovi) | le prove delle funzioni pure |
| `docs/superpowers/specs/2026-10-07-booking-slice3-online-booking-design.md`, `.claude/skills/db-migrations/SKILL.md` (modifica) | la «porta» per il pagamento, la chiave delle righe, la trappola delle migrazioni di enum |

---

### Task 0: la copia di lavoro

**Files:** nessuno nel repository.

- [ ] **Step 1: Crea il ramo e la copia di lavoro da `staging`**

```bash
cd /c/GitHub/lelettricaleoni.com
git fetch -q
git worktree add -b feat/booking-3a-holds ../lelettrica-3a origin/staging
cd ../lelettrica-3a
git branch --show-current
```
Expected: `feat/booking-3a-holds`.

- [ ] **Step 2: Collega le dipendenze e l'ambiente**

```bash
cp ../lelettricaleoni.com/.env.local .env.local
cmd //c "mklink /J node_modules ..\\lelettricaleoni.com\\node_modules"
node scripts/copy-cesium.mjs
```
Expected: la junction viene creata (**mai** `cp -r node_modules`: copierebbe centinaia di MB) e Cesium copiato.

- [ ] **Step 3: Verifica che i test sul database partano**

Run: `npm run test:db -- tests/db/customer-link.test.ts`
Expected: PASS (23 test). Se fallisce per la connessione, ricontrolla `.env.local`.

---

### Task 1: valori di enum (migrazione 0018)

**Files:**
- Modify: `lib/db/schema.ts:178-179`
- Create: `lib/db/migrations/0018_booking_status_values.sql` (generato)
- Test: `tests/db/booking-schema.test.ts`

**Interfaces:**
- Produces: `reservation_status` con `confirmed | held | expired | cancelled`; `reservation_kind` con `counter_rental | maintenance | online_rental`.

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// tests/db/booking-schema.test.ts
import { describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'

const enumValues = async (type: string) => {
  const rows = await db.execute<{ v: string }>(sql`select unnest(enum_range(null::${sql.identifier(type)}))::text as v`)
  return rows.map((row) => row.v)
}

describe('the enums of a booking', () => {
  it('has the states a held bike goes through', async () => {
    expect(await enumValues('reservation_status')).toEqual(expect.arrayContaining(['confirmed', 'held', 'expired', 'cancelled']))
  })

  it('has a kind for a rental made online', async () => {
    expect(await enumValues('reservation_kind')).toEqual(expect.arrayContaining(['counter_rental', 'maintenance', 'online_rental']))
  })
})
```

> `sql.identifier` è ammesso (il guardiano vieta solo `sql.raw`, `.unsafe` e stringhe a `execute`).

- [ ] **Step 2: Verifica che fallisca**

Run: `npm run test:db -- tests/db/booking-schema.test.ts`
Expected: FAIL (`held` non nell'elenco).

- [ ] **Step 3: Cambia gli enum nello schema**

In `lib/db/schema.ts` sostituisci le due righe:

```ts
export const reservationKindEnum = pgEnum('reservation_kind', ['counter_rental', 'maintenance', 'online_rental'])
export const reservationStatusEnum = pgEnum('reservation_status', ['confirmed', 'held', 'expired', 'cancelled'])
```

- [ ] **Step 4: Genera e controlla la migrazione**

Run: `npx drizzle-kit generate --name booking_status_values`
Expected: `lib/db/migrations/0018_booking_status_values.sql` con tre `ALTER TYPE ... ADD VALUE` (`online_rental`, `held`, `expired`). Aprila e controlla: **solo** `ADD VALUE`, niente altro.

- [ ] **Step 5: Applicala da sola al database di sviluppo**

Run: `npm run db:migrate`
Expected: `Migrations applied.`

- [ ] **Step 6: Verifica che passi**

Run: `npm run test:db -- tests/db/booking-schema.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add lib/db/schema.ts lib/db/migrations tests/db/booking-schema.test.ts
git commit -m "Booking enums: held, expired and online_rental (migration 0018)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `bookings`, `booking_id` e il vincolo con `held` (migrazione 0019)

**Files:**
- Modify: `lib/db/schema.ts` (dopo `export type Customer`, e `bikeReservations`)
- Create: `lib/db/migrations/0019_bookings_and_held.sql` (generato, poi corretto a mano)
- Modify: `tests/db/fixtures.ts`
- Test: `tests/db/booking-schema.test.ts`

**Interfaces:**
- Consumes: gli enum del Task 1.
- Produces: `bookingStatusEnum`; tabella `bookings` (`id`, `customerId`, `requestKey`, `status`, `startsOn`, `endsOn`, `totalCents`, `language`, `stripeSessionId`, `stripePaymentIntentId`, `holdExpiresAt`, `createdAt`, `confirmedAt`); `bikeReservations.bookingId`; tipi `Booking`, `NewBooking`; il vincolo `bike_reservations_no_overlap` su `confirmed` e `held`; helper di test `insertBooking(customerId, range, options?)` e `insertOnlineLine(bookingId, customerId, bikeUnitId, range, status)`.

- [ ] **Step 1: Aggiungi gli helper di test e la pulizia**

In `tests/db/fixtures.ts` aggiorna l'import e aggiungi in fondo:

```ts
import { sql } from 'drizzle-orm'
import { bookings } from '@/lib/db'
import type { DayRange } from '@/lib/dates'

export type LineStatus = 'held' | 'confirmed' | 'expired' | 'cancelled'

/** A booking of `customerId` for the range; pending, holding for 30 minutes, unless told otherwise. */
export async function insertBooking(
  customerId: string,
  range: DayRange,
  options: { status?: 'pending' | 'confirmed' | 'expired' | 'cancelled'; holdMinutes?: number; createdMinutesAgo?: number } = {},
): Promise<string> {
  const [row] = await db.insert(bookings).values({
    customerId,
    requestKey: crypto.randomUUID(),
    status: options.status ?? 'pending',
    startsOn: range.startsOn,
    endsOn: range.endsOn,
    totalCents: 4500,
    holdExpiresAt: sql`now() + make_interval(mins => ${options.holdMinutes ?? 30})`,
    createdAt: sql`now() - make_interval(mins => ${options.createdMinutesAgo ?? 0})`,
  }).returning({ id: bookings.id })
  return row.id
}

/** One bike of an online booking, in the given state. */
export async function insertOnlineLine(
  bookingId: string, customerId: string, bikeUnitId: string, range: DayRange, status: LineStatus,
): Promise<string> {
  const [row] = await db.insert(bikeReservations).values({
    bikeUnitId, kind: 'online_rental', status, startsOn: range.startsOn, endsOn: range.endsOn,
    customerId, bookingId, amountCents: 4500, requestKey: crypto.randomUUID(),
  }).returning({ id: bikeReservations.id })
  return row.id
}
```

e nella `cleanup` di `createFixture`, **dopo** la riga che cancella le prenotazioni del cliente e **prima** di cancellare il cliente, aggiungi:

```ts
      await db.delete(bookings).where(eq(bookings.customerId, customer.id))
```

(I clienti extra creati dai singoli test puliscono le proprie prenotazioni da soli.)

- [ ] **Step 2: Scrivi i test che falliscono**

Aggiungi a `tests/db/booking-schema.test.ts`:

```ts
import { afterEach, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { bikeReservations } from '@/lib/db'
import { createFixture, insertBooking, insertOnlineLine, reservationValues, type Fixture } from './fixtures'
import { EXCLUSION_VIOLATION, CHECK_VIOLATION, pgErrorCode } from '@/lib/pg-errors'

const RANGE = { startsOn: '2031-08-04', endsOn: '2031-08-07' }
const OVERLAPPING = { startsOn: '2031-08-06', endsOn: '2031-08-09' }

describe('the exclusion constraint, with held bikes', () => {
  let fx: Fixture
  beforeEach(async () => { fx = await createFixture(1) })
  afterEach(async () => { await fx.cleanup() })

  const unit = () => fx.unitIds[0]
  const failsWith = async (promise: Promise<unknown>) => {
    try { await promise } catch (error) { return pgErrorCode(error) }
    return undefined
  }

  it('lets a held bike block another held bike', async () => {
    const first = await insertBooking(fx.customerId, RANGE)
    await insertOnlineLine(first, fx.customerId, unit(), RANGE, 'held')
    const second = await insertBooking(fx.customerId, OVERLAPPING)
    expect(await failsWith(insertOnlineLine(second, fx.customerId, unit(), OVERLAPPING, 'held'))).toBe(EXCLUSION_VIOLATION)
  })

  it('lets a held bike block a confirmed rental at the counter', async () => {
    const booking = await insertBooking(fx.customerId, RANGE)
    await insertOnlineLine(booking, fx.customerId, unit(), RANGE, 'held')
    const code = await failsWith(db.insert(bikeReservations).values(
      reservationValues(unit(), OVERLAPPING.startsOn, OVERLAPPING.endsOn, { kind: 'counter_rental', customerId: fx.customerId, amountCents: 100 }),
    ))
    expect(code).toBe(EXCLUSION_VIOLATION)
  })

  it('does not let an expired or a cancelled row block anything', async () => {
    const booking = await insertBooking(fx.customerId, RANGE, { status: 'expired' })
    await insertOnlineLine(booking, fx.customerId, unit(), RANGE, 'expired')
    const other = await insertBooking(fx.customerId, RANGE, { status: 'cancelled' })
    await insertOnlineLine(other, fx.customerId, unit(), RANGE, 'cancelled')
    const live = await insertBooking(fx.customerId, OVERLAPPING)
    await insertOnlineLine(live, fx.customerId, unit(), OVERLAPPING, 'held')
    const rows = await db.select().from(bikeReservations).where(eq(bikeReservations.bikeUnitId, unit()))
    expect(rows).toHaveLength(3)
  })

  it('refuses an online rental with no booking, and a booking line that is not an online rental', async () => {
    expect(await failsWith(db.insert(bikeReservations).values({
      bikeUnitId: unit(), kind: 'online_rental', status: 'held', startsOn: RANGE.startsOn, endsOn: RANGE.endsOn,
      customerId: fx.customerId, requestKey: crypto.randomUUID(), amountCents: 100,
    }))).toBe(CHECK_VIOLATION)
    const booking = await insertBooking(fx.customerId, RANGE)
    expect(await failsWith(db.insert(bikeReservations).values({
      bikeUnitId: unit(), kind: 'maintenance', status: 'confirmed', startsOn: RANGE.startsOn, endsOn: RANGE.endsOn,
      bookingId: booking, requestKey: crypto.randomUUID(),
    }))).toBe(CHECK_VIOLATION)
  })

  it('keeps the table closed to the API (row level security on, no policy)', async () => {
    const rows = await db.execute<{ relrowsecurity: boolean }>(sql`select relrowsecurity from pg_class where oid = 'public.bookings'::regclass`)
    expect(rows[0].relrowsecurity).toBe(true)
  })
})
```

- [ ] **Step 3: Aggiungi lo schema**

In `lib/db/schema.ts`, dopo `export type Customer = typeof customers.$inferSelect`:

```ts
export const bookingStatusEnum = pgEnum('booking_status', ['pending', 'confirmed', 'cancelled', 'expired', 'failed_refunded'])

// One payment: the bikes of one cart, with the same days. `pending` while the bikes are held and the
// payment is on its way, `confirmed` once paid, `expired` when the hold ran out (or was given up),
// `cancelled` when every bike has been cancelled, `failed_refunded` when a payment arrived for bikes
// that were no longer ours and was given back in full (docs/superpowers/specs/2026-10-07-booking-slice3-*).
export const bookings = pgTable('bookings', {
  id:                    uuid('id').primaryKey().defaultRandom(),
  customerId:            uuid('customer_id').notNull().references(() => customers.id),
  // The idempotency key of the whole booking: asking twice with it finds the same booking.
  requestKey:            uuid('request_key').notNull().unique(),
  status:                bookingStatusEnum('status').notNull().default('pending'),
  startsOn:              date('starts_on', { mode: 'string' }).notNull(),
  endsOn:                date('ends_on', { mode: 'string' }).notNull(),
  totalCents:            integer('total_cents').notNull(),
  // The language of the page the person booked from.
  language:              text('language').notNull().default('it'),
  stripeSessionId:       text('stripe_session_id').unique(),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  holdExpiresAt:         timestamp('hold_expires_at', { withTimezone: true }).notNull(),
  createdAt:             timestamp('created_at').notNull().defaultNow(),
  confirmedAt:           timestamp('confirmed_at'),
}, (t) => [
  index('bookings_customer_idx').on(t.customerId),
  index('bookings_status_expires_idx').on(t.status, t.holdExpiresAt),
])

export type Booking = typeof bookings.$inferSelect
export type NewBooking = typeof bookings.$inferInsert
```

e in `bikeReservations`, dopo `customerId`:

```ts
  // The booking an online rental belongs to (null for the counter and for maintenance).
  bookingId:   uuid('booking_id').references(() => bookings.id),
```
aggiungendo nell'array di indici di quella tabella: `index('bike_reservations_booking_idx').on(t.bookingId),`.

- [ ] **Step 4: Genera la migrazione**

Run: `npx drizzle-kit generate --name bookings_and_held`
Expected: `0019_bookings_and_held.sql` con `CREATE TYPE booking_status`, `CREATE TABLE bookings`, la colonna e gli indici.

- [ ] **Step 5: Correggi a mano la migrazione**

Aggiungi in fondo al file `0019_bookings_and_held.sql` (ogni istruzione separata da `--> statement-breakpoint`):

```sql
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_range_check" CHECK ("ends_on" > "starts_on");
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_total_check" CHECK ("total_cents" >= 0);
--> statement-breakpoint
-- Explicit, not left to the ensure_rls event trigger: development and Preview do not have it.
-- No policies on purpose: the app connects as `postgres`, which bypasses RLS.
ALTER TABLE "bookings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- A bike being paid for blocks the bike as a confirmed one does.
ALTER TABLE "bike_reservations" DROP CONSTRAINT "bike_reservations_no_overlap";
--> statement-breakpoint
ALTER TABLE "bike_reservations" ADD CONSTRAINT "bike_reservations_no_overlap" EXCLUDE USING gist ("bike_unit_id" extensions.gist_uuid_ops WITH =, "during" WITH &&) WHERE ("status" IN ('confirmed', 'held'));
--> statement-breakpoint
-- An online rental has a customer and a booking; nothing else has a booking.
ALTER TABLE "bike_reservations" ADD CONSTRAINT "bike_reservations_online_has_booking" CHECK (
  ("kind" = 'online_rental' AND "booking_id" IS NOT NULL AND "customer_id" IS NOT NULL)
  OR ("kind" <> 'online_rental' AND "booking_id" IS NULL)
);
```

- [ ] **Step 6: Applica e prova**

Run: `npm run db:migrate && npm run test:db -- tests/db/booking-schema.test.ts`
Expected: `Migrations applied.` e tutti i test PASS (6).

- [ ] **Step 7: Controlla che il resto non sia rotto**

Run: `npx tsc --noEmit && npm run test:db -- tests/db/constraint.test.ts tests/db/reservations.test.ts`
Expected: nessun errore di tipi; i test esistenti PASS (il vincolo ricreato si comporta come prima per `confirmed`).

- [ ] **Step 8: Commit**

```bash
git branch --show-current
git add lib/db/schema.ts lib/db/migrations tests/db/fixtures.ts tests/db/booking-schema.test.ts
git commit -m "Bookings: the table, booking_id, and a held bike blocks like a confirmed one (migration 0019)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: il pannello e il banco contano anche i posti tenuti

**Files:**
- Create: `lib/booking/occupancy.ts`
- Modify: `lib/reservations.ts` (funzioni elencate nello Step 3)
- Test: `tests/db/occupancy.test.ts`

**Interfaces:**
- Consumes: `insertBooking`, `insertOnlineLine` (Task 2).
- Produces: `OCCUPYING_STATUSES`, `occupying(): SQL`; `GridReservation.status: 'confirmed' | 'held'`.

- [ ] **Step 1: Scrivi i test che falliscono**

```ts
// tests/db/occupancy.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createCounterRental, getGrid, getMoveCandidates, getOccupiedRanges, planMaintenance, retireBikeUnit,
} from '@/lib/reservations'
import { createFixture, insertBooking, insertOnlineLine, type Fixture } from './fixtures'

const RANGE = { startsOn: '2031-09-10', endsOn: '2031-09-13' }

describe('a held bike is an occupied bike, for everything the shop does', () => {
  let fx: Fixture
  beforeEach(async () => { fx = await createFixture(2) })
  afterEach(async () => { await fx.cleanup() })

  async function hold(unitId: string, range = RANGE) {
    const booking = await insertBooking(fx.customerId, range)
    return insertOnlineLine(booking, fx.customerId, unitId, range, 'held')
  }
  const rental = () => ({
    requestKey: crypto.randomUUID(), bikeModelId: fx.modelId, bikeSizeId: fx.sizeId, bikeVersionId: fx.versionId,
    ...RANGE, customerId: fx.customerId, amountCents: 1000, confirmDuplicate: true,
  })

  it('is skipped by the assignment of a rental at the counter', async () => {
    await hold(fx.unitIds[0])
    const first = await createCounterRental(rental())
    expect(first.status).toBe('created')
    if (first.status === 'created') expect(first.bikeUnitId).toBe(fx.unitIds[1])
    expect((await createCounterRental(rental())).status).toBe('no_bike_free')
  })

  it('is listed among the conflicts of a maintenance', async () => {
    const reservationId = await hold(fx.unitIds[0])
    const result = await planMaintenance({ requestKey: crypto.randomUUID(), bikeUnitId: fx.unitIds[0], ...RANGE, label: 'x' })
    expect(result.status).toBe('conflict')
    if (result.status === 'conflict') expect(result.conflicts.map((c) => c.id)).toEqual([reservationId])
  })

  it('is among the occupied ranges of its bike', async () => {
    await hold(fx.unitIds[0])
    expect(await getOccupiedRanges(fx.unitIds[0])).toEqual([RANGE])
  })

  it('is not offered as a place to move a rental to', async () => {
    const made = await createCounterRental(rental())
    if (made.status !== 'created') throw new Error('setup')
    const other = fx.unitIds.find((id) => id !== made.bikeUnitId)!
    expect((await getMoveCandidates(made.reservationId)).map((c) => c.bikeUnitId)).toContain(other)
    await hold(other)
    expect((await getMoveCandidates(made.reservationId)).map((c) => c.bikeUnitId)).not.toContain(other)
  })

  it('stops the bike from being retired while it is held', async () => {
    await hold(fx.unitIds[0])
    const result = await retireBikeUnit(fx.unitIds[0], '2031-09-11')
    expect(result.status).toBe('conflict')
  })

  it('shows in the calendar as a held reservation', async () => {
    const reservationId = await hold(fx.unitIds[0])
    const grid = await getGrid('2031-09')
    const line = grid.flatMap((unit) => unit.reservations).find((r) => r.id === reservationId)
    expect(line?.status).toBe('held')
  })

  it('does not count an expired row, nor a cancelled one', async () => {
    const booking = await insertBooking(fx.customerId, RANGE, { status: 'expired' })
    await insertOnlineLine(booking, fx.customerId, fx.unitIds[0], RANGE, 'expired')
    const cancelled = await insertBooking(fx.customerId, RANGE, { status: 'cancelled' })
    await insertOnlineLine(cancelled, fx.customerId, fx.unitIds[1], RANGE, 'cancelled')
    expect((await createCounterRental(rental())).status).toBe('created')
    expect((await createCounterRental(rental())).status).toBe('created')
    expect(await getOccupiedRanges(fx.unitIds[0])).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npm run test:db -- tests/db/occupancy.test.ts`
Expected: FAIL (le funzioni ignorano `held`; `status` manca nella griglia).

- [ ] **Step 3: Scrivi `occupancy.ts` e correggi `lib/reservations.ts`**

```ts
// lib/booking/occupancy.ts
import { inArray, type SQL } from 'drizzle-orm'
import { bikeReservations } from '@/lib/db'

/**
 * The states in which a reservation keeps a bike for its days. A bike being paid for (`held`) is as taken as a paid one:
 * the exclusion constraint says so (migration 0019), and everything that decides "is this bike free" has to say the same, or it
 * picks a bike the database will then refuse. `expired` and `cancelled` free the bike.
 *
 * Statements written by hand in `lib/reservations.ts` repeat this list as `r.status in ('confirmed', 'held')`: there is no
 * escape hatch to splice it in, on purpose (lib/db/no-raw-sql.test.ts), and tests/db/occupancy.test.ts holds them to it.
 */
export const OCCUPYING_STATUSES = ['confirmed', 'held'] as const

export function occupying(): SQL {
  return inArray(bikeReservations.status, [...OCCUPYING_STATUSES])
}
```

In `lib/reservations.ts`:
1. aggiungi l'import `import { occupying } from '@/lib/booking/occupancy'`;
2. in `findOverlaps` (riga ~63) sostituisci `eq(bikeReservations.status, 'confirmed'),` con `occupying(),`;
3. in `createCounterRental` (riga ~149) sostituisci `r.status = 'confirmed'` con `r.status in ('confirmed', 'held')`;
4. in `getMoveCandidates` (riga ~237) lo stesso;
5. in `getOccupiedRanges` (riga ~320) sostituisci `eq(bikeReservations.status, 'confirmed'),` con `occupying(),`;
6. in `getGrid` (riga ~413) sostituisci `eq(bikeReservations.status, 'confirmed'),` con `occupying(),`, aggiungi a `GridReservation` il campo `/** \`held\` while the person is still paying for it. */ status: 'confirmed' | 'held'` e, dove si costruisce l'oggetto, `status: row.status === 'held' ? 'held' : 'confirmed',`;
7. in `retireBikeUnit` (righe ~466 e ~475) il `r.status = 'confirmed'` della sottoquery diventa `r.status in ('confirmed', 'held')` e `eq(bikeReservations.status, 'confirmed'),` diventa `occupying(),`.

**Non toccare** `cancelReservation`, `moveReservation`, `updateMaintenance`, `getMaintenanceByUnit`, `findPossibleDuplicate`: lavorano su prenotazioni vere (`confirmed`).

Se `GridReservation` è costruito altrove (cerca `GridReservation` e `amountCents:` nei componenti e nei test), aggiungi `status: 'confirmed'`.

- [ ] **Step 4: Verifica che passino, insieme ai test esistenti**

Run: `npx tsc --noEmit && npm run test:db -- tests/db/occupancy.test.ts tests/db/reservations.test.ts tests/db/retirement.test.ts tests/db/constraint.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add lib/booking/occupancy.ts lib/reservations.ts tests/db/occupancy.test.ts
git commit -m "A held bike is an occupied bike for the counter, the move, the retirement and the calendar

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: le regole (funzioni pure)

**Files:**
- Create: `lib/booking/rules.ts`
- Test: `lib/booking/rules.test.ts`

**Interfaces:**
- Produces:
  - `HOLD_MINUTES = 30`, `MAX_BIKES_PER_BOOKING = 10`, `MAX_DAYS_AHEAD = 180`, `ABANDONED_LIMIT = 5`
  - `checkStay(startsOn: string, endsOn: string, today: IsoDate): StayCheck` con `StayCheck = { ok: true; days: number } | { ok: false; reason: 'invalid_date' | 'not_a_range' | 'too_soon' | 'too_far' }`
  - `BikeSpec = { bikeModelId: string; bikeSizeId: string; bikeVersionId: string }`, `CartItem = BikeSpec & { quantity: number }`
  - `cartSchema` (zod), `expandCart(items: CartItem[]): BikeSpec[]`

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// lib/booking/rules.test.ts
import { describe, expect, it } from 'vitest'
import { cartSchema, checkStay, expandCart, MAX_BIKES_PER_BOOKING } from './rules'

const TODAY = '2031-07-01'

describe('checkStay', () => {
  it('accepts a stay that starts tomorrow, and counts its days (the end is exclusive)', () => {
    expect(checkStay('2031-07-02', '2031-07-05', TODAY)).toEqual({ ok: true, days: 3 })
  })

  it('refuses a stay that starts today or before: the same day is the shop\'s, at the counter', () => {
    expect(checkStay('2031-07-01', '2031-07-03', TODAY)).toEqual({ ok: false, reason: 'too_soon' })
    expect(checkStay('2031-06-20', '2031-07-03', TODAY)).toEqual({ ok: false, reason: 'too_soon' })
  })

  it('refuses an end that is not after the start', () => {
    expect(checkStay('2031-07-05', '2031-07-05', TODAY)).toEqual({ ok: false, reason: 'not_a_range' })
    expect(checkStay('2031-07-05', '2031-07-03', TODAY)).toEqual({ ok: false, reason: 'not_a_range' })
  })

  it('refuses what is not a day', () => {
    expect(checkStay('2031-7-2', '2031-07-05', TODAY)).toEqual({ ok: false, reason: 'invalid_date' })
    expect(checkStay('2031-07-02', 'tomorrow', TODAY)).toEqual({ ok: false, reason: 'invalid_date' })
    expect(checkStay('2031-02-30', '2031-03-05', TODAY)).toEqual({ ok: false, reason: 'invalid_date' })
  })

  it('allows the last day to be 180 days from today, and not one more', () => {
    // today + 180 = 2031-12-28; the end is exclusive, so 2031-12-29 is the latest end.
    expect(checkStay('2031-12-26', '2031-12-29', TODAY)).toEqual({ ok: true, days: 3 })
    expect(checkStay('2031-12-26', '2031-12-30', TODAY)).toEqual({ ok: false, reason: 'too_far' })
  })
})

const model = '11111111-1111-4111-8111-111111111111'
const size = '22222222-2222-4222-8222-222222222222'
const version = '33333333-3333-4333-8333-333333333333'
const item = (quantity: number) => ({ bikeModelId: model, bikeSizeId: size, bikeVersionId: version, quantity })

describe('cartSchema', () => {
  it('accepts a cart of one to ten bikes in total', () => {
    expect(cartSchema.safeParse([item(1)]).success).toBe(true)
    expect(cartSchema.safeParse([item(4), item(6)]).success).toBe(true)
  })

  it(`refuses an empty cart, a quantity of 0, and more than ${MAX_BIKES_PER_BOOKING} bikes in total`, () => {
    expect(cartSchema.safeParse([]).success).toBe(false)
    expect(cartSchema.safeParse([item(0)]).success).toBe(false)
    expect(cartSchema.safeParse([item(5), item(6)]).success).toBe(false)
    expect(cartSchema.safeParse([item(11)]).success).toBe(false)
  })

  it('refuses ids that are not ids, and a quantity that is not a whole number', () => {
    expect(cartSchema.safeParse([{ ...item(1), bikeModelId: 'abc' }]).success).toBe(false)
    expect(cartSchema.safeParse([item(1.5)]).success).toBe(false)
    expect(cartSchema.safeParse([{ ...item(1), bikeSizeId: undefined }]).success).toBe(false)
  })
})

describe('expandCart', () => {
  it('makes one entry per bike, in the order of the cart', () => {
    const other = { ...item(1), bikeSizeId: '44444444-4444-4444-8444-444444444444' }
    const lines = expandCart([item(2), other])
    expect(lines).toHaveLength(3)
    expect(lines[0]).toEqual({ bikeModelId: model, bikeSizeId: size, bikeVersionId: version })
    expect(lines[2].bikeSizeId).toBe(other.bikeSizeId)
    expect(lines[0]).not.toHaveProperty('quantity')
  })
})
```

- [ ] **Step 2: Verifica che fallisca**

Run: `npx vitest run lib/booking/rules.test.ts`
Expected: FAIL (`./rules` non esiste).

- [ ] **Step 3: Scrivi l'implementazione**

```ts
// lib/booking/rules.ts
import { z } from 'zod'
import { addDaysTo, daysBetween, inclusiveEnd, isValidDay, type IsoDate } from '@/lib/dates'

/** How long the bikes of a booking are kept while the person pays: the minimum of a Stripe Checkout session. */
export const HOLD_MINUTES = 30
export const MAX_BIKES_PER_BOOKING = 10
/** The last day of a stay may be at most this many days from today. Only for the public page: the panel has no limit. */
export const MAX_DAYS_AHEAD = 180
/** A customer who has let this many bookings lapse in the last hour waits before starting another. */
export const ABANDONED_LIMIT = 5

export type StayCheck =
  | { ok: true; days: number }
  | { ok: false; reason: 'invalid_date' | 'not_a_range' | 'too_soon' | 'too_far' }

/**
 * Whether the days of an online booking are acceptable, and how many there are. `endsOn` is exclusive, as in the database.
 * Online you book from tomorrow: today's rentals are made at the counter. The category's own limit (`maxRentalDays`) is
 * checked when the price is asked (lib/booking/pricing.ts), because it belongs to each bike.
 */
export function checkStay(startsOn: string, endsOn: string, today: IsoDate): StayCheck {
  if (!isValidDay(startsOn) || !isValidDay(endsOn)) return { ok: false, reason: 'invalid_date' }
  const days = daysBetween(startsOn, endsOn)
  if (days < 1) return { ok: false, reason: 'not_a_range' }
  if (daysBetween(today, startsOn) < 1) return { ok: false, reason: 'too_soon' }
  if (daysBetween(addDaysTo(today, MAX_DAYS_AHEAD), inclusiveEnd(endsOn)) > 0) return { ok: false, reason: 'too_far' }
  return { ok: true, days }
}

export const bikeSpecSchema = z.object({
  bikeModelId: z.uuid(),
  bikeSizeId: z.uuid(),
  bikeVersionId: z.uuid(),
})

export const cartItemSchema = bikeSpecSchema.extend({
  quantity: z.number().int().min(1).max(MAX_BIKES_PER_BOOKING),
})

/** A cart: one to ten bikes in total, each entry a model, a size and a version with a quantity. */
export const cartSchema = z.array(cartItemSchema).min(1).refine(
  (items) => items.reduce((sum, item) => sum + item.quantity, 0) <= MAX_BIKES_PER_BOOKING,
  { message: `at most ${MAX_BIKES_PER_BOOKING} bikes in a booking` },
)

export type BikeSpec = z.infer<typeof bikeSpecSchema>
export type CartItem = z.infer<typeof cartItemSchema>

/** One entry per bike, in the order of the cart: what is held, one bike at a time. */
export function expandCart(items: CartItem[]): BikeSpec[] {
  return items.flatMap(({ quantity, ...spec }) => Array.from({ length: quantity }, () => ({ ...spec })))
}
```

- [ ] **Step 4: Verifica che passi**

Run: `npx vitest run lib/booking/rules.test.ts`
Expected: PASS (11).

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add lib/booking/rules.ts lib/booking/rules.test.ts
git commit -m "Booking rules: the days, the limits and the cart, as pure functions

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: il prezzo (funzioni pure)

**Files:**
- Create: `lib/booking/pricing.ts`
- Test: `lib/booking/pricing.test.ts`

**Interfaces:**
- Consumes: `priceForDay(category, days, adjustmentPercent)` da `lib/bike-pricing.ts`; `toCents` da `lib/money.ts`.
- Produces: `stayPriceCents(category: BikeCategory, days: number, adjustmentPercent: number): number | null` (null se la categoria non offre quel numero di giorni); `sumCents(amounts: number[]): number`.

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// lib/booking/pricing.test.ts
import { describe, expect, it } from 'vitest'
import type { BikeCategory } from '@/lib/db'
import { stayPriceCents, sumCents } from './pricing'

const table: BikeCategory = {
  id: 'c1', name: 'Gravel', displayOrder: 0, routeCategoryId: null, maxRentalDays: 7, pricingMode: 'table',
  day1Price: '25', day2Price: '47', day3Price: '68', day4Price: '88', day5Price: '105', day6Price: '120', day7Price: '135',
  perDayAfterPrice: null, afternoonPrice: '20',
}
const linear: BikeCategory = { ...table, id: 'c2', name: 'City', pricingMode: 'linear', maxRentalDays: 14, day1Price: '10', perDayAfterPrice: '8' }

describe('stayPriceCents', () => {
  it('is the price of the whole stay, from the table, in cents', () => {
    expect(stayPriceCents(table, 1, 0)).toBe(2500)
    expect(stayPriceCents(table, 3, 0)).toBe(6800)
    expect(stayPriceCents(table, 7, 0)).toBe(13500)
  })

  it('follows the line for a category priced per day after the first', () => {
    expect(stayPriceCents(linear, 3, 0)).toBe(2600)
    expect(stayPriceCents(linear, 14, 0)).toBe(11400)
  })

  it('applies the model\'s percentage and rounds to the whole euro, as the shop does', () => {
    expect(stayPriceCents(table, 3, 10)).toBe(7500) // 68 + 10% = 74.80
    expect(stayPriceCents(table, 3, -10)).toBe(6100) // 68 - 10% = 61.20
  })

  it('is null for a number of days the category does not offer', () => {
    expect(stayPriceCents(table, 8, 0)).toBeNull()
    expect(stayPriceCents(table, 0, 0)).toBeNull()
    expect(stayPriceCents({ ...table, day3Price: null }, 3, 0)).toBeNull()
  })
})

describe('sumCents', () => {
  it('adds whole cents without drifting', () => {
    expect(sumCents([6800, 2500, 7500])).toBe(16800)
    expect(sumCents([])).toBe(0)
  })
})
```

- [ ] **Step 2: Verifica che fallisca**

Run: `npx vitest run lib/booking/pricing.test.ts`
Expected: FAIL (`./pricing` non esiste).

- [ ] **Step 3: Scrivi l'implementazione**

```ts
// lib/booking/pricing.ts
import type { BikeCategory } from '@/lib/db'
import { priceForDay } from '@/lib/bike-pricing'
import { toCents } from '@/lib/money'

/**
 * What a stay of `days` whole days costs for one bike, in cents, or null when the category does not offer that many days.
 * The price list is by DURATION (a table of 1 to 7 days, or a line), so this is the price of the whole stay, not of one day.
 * The model's own percentage is applied on top. Always computed on the server: the browser shows an estimate, never decides.
 */
export function stayPriceCents(category: BikeCategory, days: number, adjustmentPercent: number): number | null {
  const euros = priceForDay(category, days, adjustmentPercent)
  return euros === null ? null : toCents(euros)
}

/** The total of a cart: whole cents, so adding never drifts. */
export function sumCents(amounts: number[]): number {
  return amounts.reduce((sum, amount) => sum + amount, 0)
}
```

- [ ] **Step 4: Verifica che passi**

Run: `npx vitest run lib/booking/pricing.test.ts && npx tsc --noEmit`
Expected: PASS e nessun errore di tipi (se `BikeCategory` ha campi in più dei miei, aggiungili ai due oggetti del test).

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add lib/booking/pricing.ts lib/booking/pricing.test.ts
git commit -m "Booking prices: the price of a stay in cents, from the price list and the model's percentage

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: la disponibilità

**Files:**
- Create: `lib/booking/availability.ts`
- Test: `tests/db/availability.test.ts`

**Interfaces:**
- Consumes: `DayRange` da `lib/dates.ts`; il vincolo e gli stati dei Task 1–3.
- Produces: `getFreeBikes(range: DayRange, options?: { publishedOnly?: boolean }): Promise<FreeBikes[]>` con `FreeBikes = { bikeModelId: string; bikeSizeId: string; bikeVersionId: string; free: number }`. `publishedOnly` vale `true` per default (la pagina pubblica vede solo i modelli pubblicati). Restituisce solo le combinazioni con almeno una bici libera.

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// tests/db/availability.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, bikeModels, bikeUnits } from '@/lib/db'
import { getFreeBikes } from '@/lib/booking/availability'
import { createFixture, insertBooking, insertOnlineLine, type Fixture } from './fixtures'

const RANGE = { startsOn: '2031-10-06', endsOn: '2031-10-09' }

describe('getFreeBikes', () => {
  let fx: Fixture
  beforeEach(async () => { fx = await createFixture(3) })
  afterEach(async () => { await fx.cleanup() })

  const mine = async (options?: { publishedOnly?: boolean }, range = RANGE) =>
    (await getFreeBikes(range, options)).find((row) => row.bikeModelId === fx.modelId)

  async function occupy(unitId: string, status: 'held' | 'confirmed' | 'expired' | 'cancelled', range = RANGE) {
    const booking = await insertBooking(fx.customerId, range)
    await insertOnlineLine(booking, fx.customerId, unitId, range, status)
  }

  it('counts the free bikes of a model, size and version', async () => {
    expect(await mine({ publishedOnly: false })).toEqual({
      bikeModelId: fx.modelId, bikeSizeId: fx.sizeId, bikeVersionId: fx.versionId, free: 3,
    })
  })

  it('takes away a bike that is held and a bike that is confirmed, and none that is expired or cancelled', async () => {
    await occupy(fx.unitIds[0], 'held')
    await occupy(fx.unitIds[1], 'expired')
    expect((await mine({ publishedOnly: false }))?.free).toBe(2)
    await occupy(fx.unitIds[2], 'confirmed')
    expect((await mine({ publishedOnly: false }))?.free).toBe(1)
  })

  it('does not count a bike whose reservation only touches the range (the end is exclusive)', async () => {
    await occupy(fx.unitIds[0], 'confirmed', { startsOn: '2031-10-03', endsOn: '2031-10-06' })
    await occupy(fx.unitIds[1], 'confirmed', { startsOn: '2031-10-09', endsOn: '2031-10-12' })
    expect((await mine({ publishedOnly: false }))?.free).toBe(3)
  })

  it('leaves out a combination with no free bike at all', async () => {
    for (const unitId of fx.unitIds) await occupy(unitId, 'held')
    expect(await mine({ publishedOnly: false })).toBeUndefined()
  })

  it('does not offer a bike that is retired before the end of the stay', async () => {
    await db.update(bikeUnits).set({ retiredOn: '2031-10-08' }).where(eq(bikeUnits.id, fx.unitIds[0]))
    expect((await mine({ publishedOnly: false }))?.free).toBe(2)
    await db.update(bikeUnits).set({ retiredOn: '2031-10-09' }).where(eq(bikeUnits.id, fx.unitIds[0]))
    expect((await mine({ publishedOnly: false }))?.free).toBe(3)
  })

  it('shows only published models unless told otherwise', async () => {
    expect(await mine()).toBeUndefined()
    await db.update(bikeModels).set({ isPublished: true }).where(eq(bikeModels.id, fx.modelId))
    expect((await mine())?.free).toBe(3)
  })
})
```

- [ ] **Step 2: Verifica che fallisca**

Run: `npm run test:db -- tests/db/availability.test.ts`
Expected: FAIL (`@/lib/booking/availability` non esiste).

- [ ] **Step 3: Scrivi l'implementazione**

```ts
// lib/booking/availability.ts
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import type { DayRange } from '@/lib/dates'

export interface FreeBikes {
  bikeModelId: string
  bikeSizeId: string
  bikeVersionId: string
  free: number
}

/**
 * How many bikes of each model, size and version are free for the whole of `range` (the end is exclusive). A bike is taken by a
 * `confirmed` or a `held` reservation that overlaps; `expired` and `cancelled` rows free it. A bike retired before the end of the
 * stay is not offered. Combinations with none free are left out.
 *
 * `publishedOnly` (the default) is what the public page shows: only models the shop has published.
 * One statement, so the picture is a single moment.
 */
export async function getFreeBikes(range: DayRange, options: { publishedOnly?: boolean } = {}): Promise<FreeBikes[]> {
  const publishedOnly = options.publishedOnly ?? true
  const rows = await db.execute<{ bike_model_id: string; bike_size_id: string; bike_version_id: string; free: number }>(sql`
    select u.bike_model_id, u.bike_size_id, u.bike_version_id, count(*)::int as free
    from bike_units u
    join bike_models m on m.id = u.bike_model_id
    where (${publishedOnly}::boolean = false or m.is_published)
      and (u.retired_on is null or ${range.endsOn}::date <= u.retired_on)
      and not exists (
        select 1 from bike_reservations r
        where r.bike_unit_id = u.id and r.status in ('confirmed', 'held')
          and r.during && daterange(${range.startsOn}::date, ${range.endsOn}::date, '[)'))
    group by u.bike_model_id, u.bike_size_id, u.bike_version_id`)
  return rows.map((row) => ({
    bikeModelId: row.bike_model_id, bikeSizeId: row.bike_size_id, bikeVersionId: row.bike_version_id, free: row.free,
  }))
}
```

- [ ] **Step 4: Verifica che passi**

Run: `npm run test:db -- tests/db/availability.test.ts`
Expected: PASS (6).

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add lib/booking/availability.ts tests/db/availability.test.ts
git commit -m "Booking availability: how many bikes of each model, size and version are free in a stay

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: tenere, confermare e far scadere i posti

**Files:**
- Create: `lib/booking/holds.ts`
- Test: `tests/db/holds.test.ts`

**Interfaces:**
- Consumes: `BikeSpec`, `HOLD_MINUTES`, `ABANDONED_LIMIT` (Task 4); `getFreeBikes` (Task 6); gli helper di test del Task 2; `EXCLUSION_VIOLATION`, `pgErrorCode` da `lib/pg-errors.ts`.
- Produces:
  - `HoldLine = BikeSpec & { amountCents: number }`
  - `StartHoldInput = { bookingKey: string; customerId: string; startsOn: IsoDate; endsOn: IsoDate; language: string; lines: HoldLine[] }`
  - `StartHoldResult = { status: 'held'; bookingId: string; holdExpiresAt: Date; replayed: boolean } | { status: 'closed'; bookingId: string; bookingStatus: string } | { status: 'has_pending'; bookingId: string } | { status: 'too_many_attempts' } | { status: 'unavailable'; lineIndex: number } | { status: 'try_again'; lineIndex: number }`
  - `startHold(input): Promise<StartHoldResult>`
  - `confirmHold(bookingId): Promise<{ confirmed: boolean; lines: number }>`
  - `expireBooking(bookingId): Promise<{ expired: boolean; lines: number }>`
  - `findPendingBooking(customerId): Promise<{ id: string; holdExpiresAt: Date; stripeSessionId: string | null } | null>`
  - `findOverduePending(): Promise<{ id: string; stripeSessionId: string | null }[]>`

  Le funzioni **non** parlano con Stripe: il piano successivo le avvolge (`settleHold`) con la regola «si libera solo dopo che Stripe ha chiuso la sessione».

- [ ] **Step 1: Scrivi i test che falliscono**

```ts
// tests/db/holds.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq, inArray, sql } from 'drizzle-orm'
import { db, bikeReservations, bookings, customers } from '@/lib/db'
import { getFreeBikes } from '@/lib/booking/availability'
import {
  confirmHold, expireBooking, findOverduePending, findPendingBooking, startHold, type StartHoldInput,
} from '@/lib/booking/holds'
import { createFixture, insertBooking, type Fixture } from './fixtures'

const RANGE = { startsOn: '2031-11-03', endsOn: '2031-11-06' }

describe('holding the bikes of a booking', () => {
  let fx: Fixture
  const others: string[] = []
  beforeEach(async () => { fx = await createFixture(3) })
  afterEach(async () => {
    await fx.cleanup()
    if (others.length) {
      await db.delete(bikeReservations).where(inArray(bikeReservations.customerId, others))
      await db.delete(bookings).where(inArray(bookings.customerId, others))
      await db.delete(customers).where(inArray(customers.id, others))
      others.length = 0
    }
  })

  const lines = (count: number) => Array.from({ length: count }, () => ({
    bikeModelId: fx.modelId, bikeSizeId: fx.sizeId, bikeVersionId: fx.versionId, amountCents: 3000,
  }))
  const input = (overrides: Partial<StartHoldInput> = {}): StartHoldInput => ({
    bookingKey: crypto.randomUUID(), customerId: fx.customerId, ...RANGE, language: 'it', lines: lines(1), ...overrides,
  })
  const free = async () => (await getFreeBikes(RANGE, { publishedOnly: false })).find((r) => r.bikeModelId === fx.modelId)?.free ?? 0
  const linesOf = (bookingId: string) => db.select().from(bikeReservations).where(eq(bikeReservations.bookingId, bookingId))
  const bookingOf = async (bookingId: string) => (await db.select().from(bookings).where(eq(bookings.id, bookingId)))[0]

  async function otherCustomer() {
    const [row] = await db.insert(customers).values({ firstName: 'db-test', lastName: `other-${crypto.randomUUID()}` }).returning()
    others.push(row.id)
    return row.id
  }

  it('holds one bike per line, on different bikes, for thirty minutes', async () => {
    const result = await startHold(input({ lines: lines(2) }))
    if (result.status !== 'held') throw new Error(`expected held, got ${result.status}`)
    expect(result.replayed).toBe(false)

    const held = await linesOf(result.bookingId)
    expect(held).toHaveLength(2)
    expect(new Set(held.map((line) => line.bikeUnitId)).size).toBe(2)
    expect(held.every((line) => line.status === 'held' && line.kind === 'online_rental' && line.customerId === fx.customerId)).toBe(true)
    expect(await free()).toBe(1)

    const booking = await bookingOf(result.bookingId)
    expect(booking).toMatchObject({ status: 'pending', totalCents: 6000, language: 'it', ...RANGE })
    const minutes = (booking.holdExpiresAt.getTime() - Date.now()) / 60_000
    expect(minutes).toBeGreaterThan(28)
    expect(minutes).toBeLessThanOrEqual(30.5)
  })

  it('replays: asking again with the same key finds the same booking and holds nothing more', async () => {
    const request = input({ lines: lines(2) })
    const first = await startHold(request)
    const second = await startHold(request)
    if (first.status !== 'held' || second.status !== 'held') throw new Error('expected held twice')
    expect(second.replayed).toBe(true)
    expect(second.bookingId).toBe(first.bookingId)
    expect(await linesOf(first.bookingId)).toHaveLength(2)
    expect(await free()).toBe(1)
  })

  it('says a replay of a booking that is no longer pending is closed, and holds nothing', async () => {
    const request = input()
    const first = await startHold(request)
    if (first.status !== 'held') throw new Error('setup')
    await expireBooking(first.bookingId)
    const again = await startHold(request)
    expect(again).toEqual({ status: 'closed', bookingId: first.bookingId, bookingStatus: 'expired' })
    expect(await free()).toBe(3)
  })

  it('is all or nothing: three bikes asked, two free, nothing stays held and the missing line is named', async () => {
    const taker = await otherCustomer()
    await startHold(input({ customerId: taker, lines: lines(1) })) // one bike gone: two free
    expect(await free()).toBe(2)

    const result = await startHold(input({ lines: lines(3) }))
    expect(result).toEqual({ status: 'unavailable', lineIndex: 2 })
    expect(await free()).toBe(2)
    const mine = await db.select().from(bookings).where(eq(bookings.customerId, fx.customerId))
    expect(mine.filter((b) => b.status === 'pending')).toHaveLength(0)
    const stillHeld = await db.select().from(bikeReservations).where(eq(bikeReservations.customerId, fx.customerId))
    expect(stillHeld.filter((line) => line.status === 'held')).toHaveLength(0)
  })

  it('race for the last bike: two customers, one bike, exactly one wins', async () => {
    const solo = await createFixture(1)
    try {
      const second = await otherCustomer()
      const request = (customerId: string) => ({
        bookingKey: crypto.randomUUID(), customerId, ...RANGE, language: 'it',
        lines: [{ bikeModelId: solo.modelId, bikeSizeId: solo.sizeId, bikeVersionId: solo.versionId, amountCents: 2000 }],
      })
      const results = await Promise.all([startHold(request(solo.customerId)), startHold(request(second))])
      expect(results.map((r) => r.status).sort()).toEqual(['held', 'unavailable'])
    } finally {
      await solo.cleanup()
    }
  })

  it('lets a customer have one payment on its way at a time', async () => {
    const first = await startHold(input())
    if (first.status !== 'held') throw new Error('setup')
    expect(await startHold(input())).toEqual({ status: 'has_pending', bookingId: first.bookingId })
    expect(await findPendingBooking(fx.customerId)).toMatchObject({ id: first.bookingId, stripeSessionId: null })
    await expireBooking(first.bookingId)
    expect(await findPendingBooking(fx.customerId)).toBeNull()
    expect((await startHold(input())).status).toBe('held')
  })

  it('makes a customer who has let five bookings lapse in the last hour wait', async () => {
    for (let i = 0; i < 5; i++) await insertBooking(fx.customerId, RANGE, { status: 'expired', createdMinutesAgo: 10 + i })
    expect(await startHold(input())).toEqual({ status: 'too_many_attempts' })
    expect(await free()).toBe(3)
  })

  it('does not count lapsed bookings older than an hour, nor four of them', async () => {
    for (let i = 0; i < 4; i++) await insertBooking(fx.customerId, RANGE, { status: 'expired', createdMinutesAgo: 10 })
    await insertBooking(fx.customerId, RANGE, { status: 'expired', createdMinutesAgo: 90 })
    expect((await startHold(input())).status).toBe('held')
  })

  it('confirms a pending booking and its bikes, once', async () => {
    const result = await startHold(input({ lines: lines(2) }))
    if (result.status !== 'held') throw new Error('setup')
    expect(await confirmHold(result.bookingId)).toEqual({ confirmed: true, lines: 2 })
    expect((await linesOf(result.bookingId)).every((line) => line.status === 'confirmed')).toBe(true)
    const booking = await bookingOf(result.bookingId)
    expect(booking.status).toBe('confirmed')
    expect(booking.confirmedAt).not.toBeNull()
    expect(await confirmHold(result.bookingId)).toEqual({ confirmed: false, lines: 0 })
  })

  it('does not confirm a booking that has expired, and its bikes stay free', async () => {
    const result = await startHold(input())
    if (result.status !== 'held') throw new Error('setup')
    expect(await expireBooking(result.bookingId)).toEqual({ expired: true, lines: 1 })
    expect(await confirmHold(result.bookingId)).toEqual({ confirmed: false, lines: 0 })
    expect((await linesOf(result.bookingId)).every((line) => line.status === 'expired')).toBe(true)
    expect(await free()).toBe(3)
  })

  it('confirm and expire together: never a confirmed booking with expired bikes, nor the other way round', async () => {
    for (let round = 0; round < 8; round++) {
      const result = await startHold(input({ bookingKey: crypto.randomUUID(), lines: lines(2) }))
      if (result.status !== 'held') throw new Error('setup')
      await Promise.all([confirmHold(result.bookingId), expireBooking(result.bookingId)])
      const booking = await bookingOf(result.bookingId)
      const states = [...new Set((await linesOf(result.bookingId)).map((line) => line.status))]
      // Whichever statement won the booking decided for the bikes too: all of them agree with it.
      expect(['confirmed', 'expired']).toContain(booking.status)
      expect(states).toEqual([booking.status])
      // free the bikes for the next round
      await db.delete(bikeReservations).where(eq(bikeReservations.bookingId, result.bookingId))
      await db.delete(bookings).where(eq(bookings.id, result.bookingId))
    }
  })

  it('lists the pending bookings whose time has run out', async () => {
    const result = await startHold(input())
    if (result.status !== 'held') throw new Error('setup')
    expect(await findOverduePending()).not.toContainEqual(expect.objectContaining({ id: result.bookingId }))
    await db.update(bookings).set({ holdExpiresAt: sql`now() - interval '1 minute'` }).where(eq(bookings.id, result.bookingId))
    expect(await findOverduePending()).toContainEqual({ id: result.bookingId, stripeSessionId: null })
    await expireBooking(result.bookingId)
    expect(await findOverduePending()).not.toContainEqual(expect.objectContaining({ id: result.bookingId }))
  })
})
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npm run test:db -- tests/db/holds.test.ts`
Expected: FAIL (`@/lib/booking/holds` non esiste).

- [ ] **Step 3: Scrivi l'implementazione**

```ts
// lib/booking/holds.ts
import { and, eq, gte, sql } from 'drizzle-orm'
import { db, bookings } from '@/lib/db'
import type { IsoDate } from '@/lib/dates'
import { EXCLUSION_VIOLATION, pgErrorCode } from '@/lib/pg-errors'
import { ABANDONED_LIMIT, HOLD_MINUTES, type BikeSpec } from './rules'

/*
 * Holding the bikes of a booking while the person pays. No Stripe in here: these functions only move rows between states, and the
 * layer that talks to Stripe wraps them (it may free a hold only after Stripe says the session can no longer be paid).
 *
 * Every step is ONE statement: this client cannot open a transaction (max_pipeline: 0, lib/db/client-options.ts). Two statements that
 * must agree (the booking and its lines) are a CTE in which the lines follow the booking's own update, so the one that wins the
 * booking row is the only one that touches the lines.
 */

const MAX_ATTEMPTS = 8

export interface HoldLine extends BikeSpec {
  amountCents: number
}

export interface StartHoldInput {
  /** The idempotency key of the whole booking: the same key finds the same booking. */
  bookingKey: string
  customerId: string
  startsOn: IsoDate
  endsOn: IsoDate
  language: string
  lines: HoldLine[]
}

export type StartHoldResult =
  | { status: 'held'; bookingId: string; holdExpiresAt: Date; replayed: boolean }
  | { status: 'closed'; bookingId: string; bookingStatus: string }
  | { status: 'has_pending'; bookingId: string }
  | { status: 'too_many_attempts' }
  | { status: 'unavailable'; lineIndex: number }
  | { status: 'try_again'; lineIndex: number }

async function findByKey(bookingKey: string) {
  const [row] = await db.select().from(bookings).where(eq(bookings.requestKey, bookingKey))
  return row
}

/** The customer's booking that is waiting for a payment, if any (the caller decides what to do with an overdue one). */
export async function findPendingBooking(customerId: string): Promise<{ id: string; holdExpiresAt: Date; stripeSessionId: string | null } | null> {
  const [row] = await db.select({ id: bookings.id, holdExpiresAt: bookings.holdExpiresAt, stripeSessionId: bookings.stripeSessionId })
    .from(bookings)
    .where(and(eq(bookings.customerId, customerId), eq(bookings.status, 'pending')))
    .limit(1)
  return row ?? null
}

/** How many bookings of the customer lapsed (were left or given up) in the last hour. */
async function countRecentlyLapsed(customerId: string): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` })
    .from(bookings)
    .where(and(
      eq(bookings.customerId, customerId),
      eq(bookings.status, 'expired'),
      gte(bookings.createdAt, sql`now() - interval '1 hour'`),
    ))
  return row?.count ?? 0
}

/**
 * Holds the bikes of a booking: the booking first, then one bike per line (a free bike of the model, size and version, the oldest
 * first), each as `held` for the days. If a line finds nobody free, everything held so far is released and the line is named; if the
 * database refuses a bike another request took a moment earlier, the line picks again, up to a few times.
 */
export async function startHold(input: StartHoldInput): Promise<StartHoldResult> {
  const existing = await findByKey(input.bookingKey)
  if (existing) {
    return existing.status === 'pending'
      ? { status: 'held', bookingId: existing.id, holdExpiresAt: existing.holdExpiresAt, replayed: true }
      : { status: 'closed', bookingId: existing.id, bookingStatus: existing.status }
  }

  const pending = await findPendingBooking(input.customerId)
  if (pending) return { status: 'has_pending', bookingId: pending.id }
  if ((await countRecentlyLapsed(input.customerId)) >= ABANDONED_LIMIT) return { status: 'too_many_attempts' }

  const totalCents = input.lines.reduce((sum, line) => sum + line.amountCents, 0)
  const [created] = await db.insert(bookings)
    .values({
      customerId: input.customerId,
      requestKey: input.bookingKey,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      totalCents,
      language: input.language,
      holdExpiresAt: sql`now() + make_interval(mins => ${HOLD_MINUTES})`,
    })
    .onConflictDoNothing({ target: bookings.requestKey })
    .returning({ id: bookings.id, holdExpiresAt: bookings.holdExpiresAt })
  if (!created) {
    // The same key won a race against this very call.
    const raced = await findByKey(input.bookingKey)
    if (!raced) return { status: 'try_again', lineIndex: 0 }
    return raced.status === 'pending'
      ? { status: 'held', bookingId: raced.id, holdExpiresAt: raced.holdExpiresAt, replayed: true }
      : { status: 'closed', bookingId: raced.id, bookingStatus: raced.status }
  }

  for (let index = 0; index < input.lines.length; index++) {
    const outcome = await holdOneBike(created.id, input, input.lines[index])
    if (outcome !== 'held') {
      await expireBooking(created.id)
      return outcome === 'none_free' ? { status: 'unavailable', lineIndex: index } : { status: 'try_again', lineIndex: index }
    }
  }
  return { status: 'held', bookingId: created.id, holdExpiresAt: created.holdExpiresAt, replayed: false }
}

async function holdOneBike(bookingId: string, input: StartHoldInput, line: HoldLine): Promise<'held' | 'none_free' | 'exhausted'> {
  // One key per line, kept across the attempts, so a repeated statement cannot hold the same line twice.
  const lineKey = crypto.randomUUID()
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const rows = await db.execute<{ id: string }>(sql`
        insert into bike_reservations (bike_unit_id, kind, status, starts_on, ends_on, customer_id, amount_cents, request_key, booking_id)
        select u.id, 'online_rental'::reservation_kind, 'held'::reservation_status,
               ${input.startsOn}::date, ${input.endsOn}::date, ${input.customerId}::uuid, ${line.amountCents}::int,
               ${lineKey}::uuid, ${bookingId}::uuid
        from bike_units u
        where u.bike_model_id = ${line.bikeModelId}::uuid
          and u.bike_size_id = ${line.bikeSizeId}::uuid
          and u.bike_version_id = ${line.bikeVersionId}::uuid
          and (u.retired_on is null or ${input.endsOn}::date <= u.retired_on)
          and not exists (
            select 1 from bike_reservations r
            where r.bike_unit_id = u.id and r.status in ('confirmed', 'held')
              and r.during && daterange(${input.startsOn}::date, ${input.endsOn}::date, '[)'))
        order by u.created_at, u.id
        limit 1
        on conflict (request_key) do nothing
        returning id`)
      if (rows.length > 0) return 'held'
      return 'none_free'
    } catch (error) {
      // Another request took the bike this one had picked, a moment earlier: pick again.
      if (pgErrorCode(error) === EXCLUSION_VIOLATION) continue
      throw error
    }
  }
  return 'exhausted'
}

/**
 * Pending → confirmed, with every held bike of the booking, in one statement. Does nothing (and says so) when the booking is no
 * longer pending: a payment cannot confirm bikes that have been released.
 */
export async function confirmHold(bookingId: string): Promise<{ confirmed: boolean; lines: number }> {
  const [row] = await db.execute<{ bookings: number; lines: number }>(sql`
    with b as (
      update bookings set status = 'confirmed', confirmed_at = now()
      where id = ${bookingId}::uuid and status = 'pending'
      returning id
    ), l as (
      update bike_reservations set status = 'confirmed'
      where booking_id in (select id from b) and status = 'held'
      returning id
    )
    select (select count(*) from b)::int as bookings, (select count(*) from l)::int as lines`)
  return { confirmed: row.bookings > 0, lines: row.lines }
}

/** Pending → expired, and every held bike of the booking freed, in one statement. */
export async function expireBooking(bookingId: string): Promise<{ expired: boolean; lines: number }> {
  const [row] = await db.execute<{ bookings: number; lines: number }>(sql`
    with b as (
      update bookings set status = 'expired'
      where id = ${bookingId}::uuid and status = 'pending'
      returning id
    ), l as (
      update bike_reservations set status = 'expired'
      where booking_id in (select id from b) and status = 'held'
      returning id
    )
    select (select count(*) from b)::int as bookings, (select count(*) from l)::int as lines`)
  return { expired: row.bookings > 0, lines: row.lines }
}

/** The pending bookings whose time has run out: what the sweeper settles (with Stripe) before freeing the bikes. */
export async function findOverduePending(): Promise<{ id: string; stripeSessionId: string | null }[]> {
  return db.select({ id: bookings.id, stripeSessionId: bookings.stripeSessionId })
    .from(bookings)
    .where(and(eq(bookings.status, 'pending'), sql`${bookings.holdExpiresAt} <= now()`))
}
```

- [ ] **Step 4: Verifica che passino**

Run: `npm run test:db -- tests/db/holds.test.ts`
Expected: PASS (11). Se «confirm and expire together» fallisce, il difetto è nella CTE: **non** allentare il test, correggi la CTE.

- [ ] **Step 5: Tutto insieme, più tipi e lint**

Run: `npx tsc --noEmit && npx eslint lib/booking tests/db && npm test && npm run test:db`
Expected: nessun errore di tipi, nessun errore di lint (gli avvisi preesistenti restano), tutti i test PASS. `lib/db/no-raw-sql.test.ts` e `lib/db/no-transactions.test.ts` devono passare: nessuno dei file nuovi usa `sql.raw`, `.unsafe` o `db.transaction`.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add lib/booking/holds.ts tests/db/holds.test.ts
git commit -m "Booking holds: keep the bikes of a cart for thirty minutes, all or nothing, and confirm or expire them

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: documenti, e la «porta» per il pagamento

**Files:**
- Modify: `docs/superpowers/specs/2026-10-07-booking-slice3-online-booking-design.md`
- Modify: `.claude/skills/db-migrations/SKILL.md`
- Modify: `docs/ai/ROADMAP.md`

**Interfaces:** nessuna.

- [ ] **Step 1: Correggi la spec dove il piano ha deciso diversamente**

Nella sezione «Dati → `bike_reservations`» sostituisci la frase sulla `request_key` derivata («…derivata in modo deterministico da quella della prenotazione (uuid v5…)…») con:

> `request_key` **casuale**, una per riga; la ripetizione della richiesta si riconosce dalla `request_key` della **prenotazione** (`bookings.request_key`), che ritrova la testata e le sue righe.

Nella sezione «Rilascio e dipendenze» sostituisci l'«Ordine di costruzione» con:

> **Stripe, per ora, fuori** (Kevin, 2026-10-07: «l'importante è non pubblicare senza che ci sia Stripe; in produzione decido io»). Ordine: **(a)** dati, disponibilità, posti tenuti e scadenza (`docs/superpowers/plans/2026-10-07-booking-slice3a-holds.md`); **(b)** una **porta per il pagamento** (`PaymentGateway`: avviare, confermare, far scadere, rimborsare) con due implementazioni: una **finta**, che esiste **solo fuori dalla produzione** (`isProduction()`) e fa «pagare» senza soldi, per costruire e provare tutto il percorso su `staging`; e **Stripe**, che si innesta dopo; **(c)** la pagina `/rent`, Account rents, annullamenti e azioni del pannello, provati con la finta; **(d)** Stripe vero, il webhook, `settleHold`, i rimborsi veri. **In produzione la porta senza Stripe configurato si rifiuta di partire**, e un test lo fissa: nessun prenotare gratis per sbaglio.

- [ ] **Step 2: Aggiungi la trappola alla skill delle migrazioni**

In `.claude/skills/db-migrations/SKILL.md`, in fondo alla sezione «Generare e applicare una migrazione», aggiungi:

```markdown
**Un valore di enum aggiunto non si usa nella stessa transazione, e `npm run db:migrate` le applica tutte in una sola.** Se una migrazione fa `ALTER TYPE … ADD VALUE` e un'altra usa quel valore (in un vincolo, in un indice parziale, in un default), generale e applicale **una alla volta**: `generate` → `db:migrate` per la prima, poi `generate` → `db:migrate` per la seconda. Sul database di produzione (una `execute_sql` per migrazione) il problema non si pone, perché ogni chiamata è una transazione; ma l'ordine resta quello. Esempio: `0018` (valori di `reservation_status`) e `0019` (il vincolo `WHERE status IN ('confirmed','held')`).
```

- [ ] **Step 3: Aggiorna la ROADMAP**

Nella voce delle prenotazioni di `docs/ai/ROADMAP.md`, subito dopo la frase sulla spec della fetta 3, aggiungi:

> **Fetta 3a (dati, disponibilità, posti tenuti): piano in `docs/superpowers/plans/2026-10-07-booking-slice3a-holds.md`.** Stripe per ora fuori: una «porta» per il pagamento con una finta solo fuori produzione, poi Stripe vero. **Solo `staging`; in produzione decide Kevin, e non senza Stripe.**

- [ ] **Step 4: Commit e PR**

```bash
git branch --show-current
git add docs .claude
git commit -m "Docs: the payment gateway seam, the booking line key, and the enum-migration trap

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push -u origin feat/booking-3a-holds
gh pr create --base staging --head feat/booking-3a-holds --title "Booking slice 3a: holds, availability and the booking tables" --body "Slice 3a of the online booking, without Stripe: the tables, the held state, availability, holding and releasing the bikes of a cart, and the panel counting held bikes as taken. Staging only. 🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Dopo aver aperto la PR **non aspettare i check**: passa ad altro e unisci dopo, quando tutti i controlli sono verdi sullo stesso commit (regola del progetto).

---

## Self-Review

**Copertura della spec** (solo ciò che questo piano dichiara):
- «Dati» — enum e stati ✔ Task 1; `bookings` ✔ Task 2; `booking_id` ✔ Task 2; vincolo con `held` ✔ Task 2; `booking_refunds` e `stripe_events` → piani successivi (dichiarato).
- «Disponibilità» ✔ Task 6; «Prezzo» ✔ Task 5; limiti (da domani, 180 giorni, 10 bici) ✔ Task 4.
- «Iniziare il pagamento» punti 2–4 (una prenotazione per cliente, 5 scadute all'ora, tenere una alla volta, rilascio se manca una riga) ✔ Task 7; punti 1 e 5–6 (validazione completa, sessione Stripe, `cancel_url`) → piano successivo.
- «Pannello conta i posti tenuti» (sezione Annullare, paragrafo «Dal pannello») ✔ Task 3, nella parte che serve a non vendere una bici che sta pagando.
- Confermare, `settleHold`, rimborsi, Account rents, `/rent`, termini, privacy → piani successivi, dichiarati in «Fuori da questo piano».

**Scansione dei segnaposto:** nessun «TBD» né «da fare»; ogni passo di codice ha il codice. L'unico riferimento a numeri di riga (`lib/reservations.ts`) è accompagnato dalla frase da cercare.

**Coerenza dei tipi:** `StartHoldInput`/`HoldLine`/`StartHoldResult` definiti nel Task 7 e usati solo lì; `BikeSpec` e `HOLD_MINUTES`/`ABANDONED_LIMIT` nel Task 4 e importati nel Task 7; `insertBooking`/`insertOnlineLine` nel Task 2, usati nei Task 3, 6, 7; `getFreeBikes` nel Task 6, usato nel Task 7; `occupying()` nel Task 3.

**Review Focus:** i cinque punti sono nei Task 7 (1, 2, 3, 5) e 3 (4), con il test accanto.

**Rischio noto:** il test «confirm and expire together» prova la concorrenza su un pooler vero; è lento (8 giri) ma è proprio ciò che serve provare.
