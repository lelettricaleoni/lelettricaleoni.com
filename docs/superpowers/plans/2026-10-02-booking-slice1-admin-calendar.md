# Booking Slice 1 (Admin Calendar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un calendario nel pannello admin (`/manage/bookings`) dove Kevin vede, per ogni bici fisica, quando è occupata, registra noleggi al banco, li annulla o sposta, e pianifica la manutenzione di una bici con data di inizio e di fine, con controlli contro gli inserimenti doppi e aggiornamenti in tempo reale.

**Architecture:** Una tabella `bike_reservations` (una riga per bici e periodo) con un vincolo di esclusione Postgres che impedisce due righe `confirmed` sulla stessa bici con date sovrapposte; due colonne `date` più un `daterange` generato. Logica nel livello dati `lib/reservations.ts` (un solo statement per operazione, ritentativo su `23P01`, chiave di idempotenza), esposta da Server Action con `zod`. Un trigger del database manda un campanello Supabase Realtime Broadcast (mai dati personali); il client rilegge. La griglia bici × giorni è costruita su `date-fns` e CSS: nessuna libreria di scheduler adatta e gratuita (vedi la spec).

**Tech Stack:** Next.js 16 (webpack), React 19, Drizzle + postgres.js sul pooler Supabase in transaction mode (`max_pipeline: 0`, niente transazioni), `date-fns` 4 + `@date-fns/tz`, `zod` 4, shadcn/ui (`calendar` = `react-day-picker`), `@supabase/supabase-js` (Realtime), vitest.

**Spec:** `docs/superpowers/specs/2026-10-02-booking-slice1-admin-calendar-design.md` (leggerla prima: le decisioni e le prove stanno lì).

## Global Constraints

Valgono per ogni task.

- **Date di calendario = stringhe `YYYY-MM-DD`**, mai `Date` per un giorno. «Oggi» si calcola in `Europe/Rome` con `@date-fns/tz`, mai con `new Date()` nudo. La fine è **esclusiva nel database** (`ends_on`) e **inclusiva nell'interfaccia**; la conversione sta solo in `lib/dates.ts`.
- **Librerie, non codice a mano**: `date-fns` 4 + `@date-fns/tz` per le date; `zod` 4 (`z.iso.date()`, `z.uuid()`) per la validazione; **nessuna regex di validazione**; il selettore di date è il `calendar` di shadcn (`react-day-picker`).
- **Niente `db.transaction` né `.begin(`** (`lib/db/no-transactions.test.ts` fa fallire la CI): ogni operazione è **un solo statement**.
- **Server Action, non route handler**; ogni azione chiama `requireAdmin()` come le altre di `lib/actions/`.
- **Codice e testi del pannello in inglese**; il pannello non è mai tradotto.
- **Letture del pannello dal vivo**, senza `'use cache'`.
- **Il messaggio Realtime è solo un campanello**: nel payload mai `label` né altri dati personali. Un canale pubblico lo può ascoltare chiunque.
- **RLS esplicito** su `bike_reservations` e **`REVOKE EXECUTE`** sulla funzione del trigger, in ogni ambiente: su sviluppo/Preview le tabelle nuove nascono senza RLS (non c'è `ensure_rls`), in produzione sì.
- **Migrazioni**: `npx drizzle-kit generate` poi `npm run db:migrate`. Mai `apply_migration` (MCP). SQL che Drizzle non genera (vincolo di esclusione, colonna generata, trigger) si scrive a mano nel file della migrazione.
- **Limiti della pagina pubblica** (180 giorni di anticipo, lunghezza massima dell'intervallo) **non** si implementano in questa fetta e non valgono nel pannello.
- **Il pannello non mostra dettagli infrastrutturali** all'utente (niente «Supabase», «Realtime», «trigger» nei testi).
- **Nessun test del browser per il pannello**: `tests/browser/` non ha un'infrastruttura di login admin e costruirla è fuori da questa fetta. La copertura è: test unitari (`npm test`, anche in CI), prove sul database (`npm run test:db`, solo a mano contro lo sviluppo) e le prove a mano scritte in ogni task.

## Review Focus

Cinque classi di input che la spec implica ma che nessun test ovvio copre. Ognuna ha il suo test nel task indicato.

1. **Una prenotazione a cavallo di due mesi** (inizia prima del mese visibile, finisce dopo, o lo copre tutto): la griglia la ritaglia e non la perde, e le colonne non sbagliano a febbraio/anno bisestile. → Task 6 (`layoutBlocks`).
2. **Un nome con accenti, maiuscole diverse o solo spazi**: `Élodie` e `élodie ` sono lo stesso nome per l'avviso di doppione; un nome di soli spazi è rifiutato. → Task 3 (test sul database) e Task 4 (schema).
3. **Un modello/taglia/versione senza bici libere, o con tutte in manutenzione**: risposta `no_bike_free`, mai una bici in manutenzione assegnata, mai un'eccezione. → Task 3.
4. **Una finestra aperta su una prenotazione che nel frattempo qualcuno ha annullato o spostato** (due schede, tempo reale in ritardo): `not_found` o `conflict` puliti, nessuna eccezione. → Task 3 e Task 8.
5. **Cancellare dal negozio una bici che ha prenotazioni, anche annullate**: messaggio chiaro, nessuna cancellazione. → Task 3 e Task 9.

---

## Flusso di lavoro e rami

Il codice sta su **`staging`**, con PR verso `staging` (regola di Kevin: nulla in produzione finché non è pronto; la fetta 1 è l'eccezione voluta, vedi Task 10). **Una PR per fase**:

- **Fase A**: Task 1-3 (date, tabella, livello dati)
- **Fase B**: Task 4-5 (azioni, tempo reale)
- **Fase C**: Task 6-9 (pannello)
- **Fase D**: Task 10 (rilascio)

Regole di git (da `CLAUDE.md` e `STATE.md`):

- Mai commit su `main` o `staging`: `git branch --show-current` prima di ogni commit.
- Dopo aver aperto una PR **non aspettare i check**: passa ad altro e unisci dopo. Unisci con `gh pr merge <n> --squash` solo dopo aver visto `headRefOid` uguale al commit dei check e **mai** cancellare il branch prima di aver letto `state=MERGED`. Una PR `BEHIND` si aggiorna con `gh pr update-branch <n>`.
- **Non fare mai squash di `staging` in `main`**: la PR di rilascio usa un merge commit (`gh pr merge --merge`), altrimenti `staging` e `main` divergono (vedi Task 10).
- Una PR costruita sopra un'altra ancora aperta va in conflitto quando la prima entra con squash: aspettare che entri, poi ripartire da `staging` aggiornato.

### Setup (una volta)

- [ ] **Step 1: Allinea `staging` a `main`** (oggi differiscono per commit di documentazione)

```bash
git fetch origin
gh pr create --base staging --head main --title "Sync staging with main" --body "Allinea staging a main prima di iniziare il lavoro sulle prenotazioni."
# a check verdi, con un merge commit (NON squash):
gh pr merge <numero> --merge
```

- [ ] **Step 2: Crea il ramo di lavoro dalla punta di `staging`**

```bash
git fetch origin
git checkout -b feat/booking-slice1-a origin/staging
git config core.hooksPath .githooks   # solo se questo clone non l'ha già fatto
```

Atteso: `git branch --show-current` stampa `feat/booking-slice1-a`.

---

## File Structure

| File | Cosa fa | Task |
|---|---|---|
| `lib/dates.ts` (+ `.test.ts`) | Tutta l'aritmetica sulle date di calendario, stringhe `YYYY-MM-DD` | 1 |
| `lib/pg-errors.ts` (+ `.test.ts`) | Estrae il codice di errore Postgres da un errore di Drizzle | 2 |
| `lib/db/schema.ts` | Enum e tabella `bike_reservations` | 2 |
| `lib/db/migrations/0010_booking_reservations.sql` | Tabella, estensione, vincolo, colonna generata, RLS | 2 |
| `vitest.db.config.ts`, `tests/db/setup.ts`, `tests/db/fixtures.ts` | Prove contro il database di **sviluppo** (`npm run test:db`) | 2 |
| `lib/reservations.ts` | Livello dati: crea, annulla, sposta, manutenzione, griglia | 3 |
| `lib/reservation-schemas.ts` (+ `.test.ts`) | Schemi `zod` degli input delle azioni | 4 |
| `lib/actions/reservations.ts` (+ `.test.ts`) | Server Action con `requireAdmin()` | 4 |
| `lib/actions/bike-units.ts` | `deleteBikeUnitAction` risponde invece di lanciare | 4 |
| `lib/db/migrations/0011_reservation_realtime.sql` | Funzione e trigger del campanello Realtime | 5 |
| `components/admin/use-reservations-realtime.ts` | Hook client: ascolta il campanello, ricarica | 5 |
| `lib/booking-grid.ts` (+ `.test.ts`) | Disposizione dei blocchi nella griglia (pura) | 6 |
| `components/admin/booking-types.ts` | Il tipo `ModelOption`, condiviso dai moduli (evita un import circolare) | 6 |
| `app/manage/bookings/page.tsx` | Pagina del calendario | 6, 7 |
| `components/admin/booking-view.tsx` | Griglia, navigazione tra i mesi, finestre (cresce nei task 6, 7, 8) | 6, 7, 8 |
| `components/ui/calendar.tsx` | Calendario shadcn (generato) | 7 |
| `components/admin/rental-form.tsx` | Nuovo noleggio, con avviso di doppione | 7 |
| `components/admin/reservation-dialog.tsx` | Dettaglio: annulla, sposta, modifica manutenzione | 8 |
| `components/admin/maintenance-form.tsx` | Pianifica manutenzione | 8 |
| `components/admin/admin-sidebar.tsx` | Voce «Bookings» | 6 |
| `app/manage/bikes/shop/page.tsx`, `components/admin/bike-unit-list.tsx` | Etichetta di manutenzione, messaggio di cancellazione | 9 |

---

# Fase A — Date, tabella, livello dati

## Task 1: La libreria di date e `lib/dates.ts`

**Files:**
- Modify: `package.json`, `package-lock.json` (con `npm install`)
- Create: `lib/dates.ts`
- Test: `lib/dates.test.ts`

**Interfaces:**
- Consumes: nulla.
- Produces (usati da tutti i task seguenti):
  `type IsoDate = string`, `type IsoMonth = string`, `const ROME`,
  `todayInRome(now?: Date): IsoDate`, `currentMonthInRome(now?: Date): IsoMonth`,
  `isoDay(date: Date): IsoDate`, `dayToDate(day: IsoDate): Date`, `isValidDay(value: string): boolean`,
  `addDaysTo(day: IsoDate, amount: number): IsoDate`, `exclusiveEnd(lastDay: IsoDate): IsoDate`,
  `inclusiveEnd(endsOn: IsoDate): IsoDate`, `daysBetween(from: IsoDate, to: IsoDate): number`,
  `parseMonth(value: string | undefined): IsoMonth | null`, `shiftMonth(month: IsoMonth, by: number): IsoMonth`,
  `monthDays(month: IsoMonth): IsoDate[]`, `monthTitle(month: IsoMonth): string`,
  `dayOfMonth(day: IsoDate): number`, `weekdayLetter(day: IsoDate): string`, `isWeekendDay(day: IsoDate): boolean`,
  `rangesOverlap(a: DayRange, b: DayRange): boolean`, `buildRange(firstDay: string, lastDay: string): RangeResult`,
  `interface DayRange { startsOn: IsoDate; endsOn: IsoDate }`,
  `type RangeResult = { ok: true; startsOn: IsoDate; endsOn: IsoDate } | { ok: false; reason: 'invalid_day' | 'end_before_start' }`.

- [ ] **Step 1: Installa le librerie**

Run: `npm install date-fns @date-fns/tz`
Expected: `package.json` ora elenca `date-fns` (`^4.x`) e `@date-fns/tz` (`^1.x`). Se `npm ls date-fns` mostra due versioni, va bene: `react-day-picker` (Task 7) usa la stessa.

- [ ] **Step 2: Scrivi il test che fallisce** — `lib/dates.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import {
  todayInRome, currentMonthInRome, isoDay, dayToDate, isValidDay, addDaysTo, exclusiveEnd, inclusiveEnd,
  daysBetween, parseMonth, shiftMonth, monthDays, monthTitle, dayOfMonth, weekdayLetter, isWeekendDay,
  rangesOverlap, buildRange,
} from './dates'

describe('todayInRome', () => {
  it('is already the next day in Rome after 22:00 UTC in summer (UTC+2)', () => {
    expect(todayInRome(new Date('2026-07-09T21:59:59Z'))).toBe('2026-07-09')
    expect(todayInRome(new Date('2026-07-09T22:00:00Z'))).toBe('2026-07-10')
  })

  it('is already the next day in Rome after 23:00 UTC in winter (UTC+1)', () => {
    expect(todayInRome(new Date('2026-01-09T22:59:59Z'))).toBe('2026-01-09')
    expect(todayInRome(new Date('2026-01-09T23:00:00Z'))).toBe('2026-01-10')
  })

  it('follows the switch to summer time (2026-03-29)', () => {
    expect(todayInRome(new Date('2026-03-28T22:59:59Z'))).toBe('2026-03-28')
    expect(todayInRome(new Date('2026-03-28T23:00:00Z'))).toBe('2026-03-29')
    expect(todayInRome(new Date('2026-03-29T21:59:59Z'))).toBe('2026-03-29')
    expect(todayInRome(new Date('2026-03-29T22:00:00Z'))).toBe('2026-03-30')
  })

  it('names the month in Rome too', () => {
    expect(currentMonthInRome(new Date('2026-07-31T21:59:59Z'))).toBe('2026-07')
    expect(currentMonthInRome(new Date('2026-07-31T22:00:00Z'))).toBe('2026-08')
  })
})

describe('isValidDay', () => {
  it('accepts real calendar days, leap days included', () => {
    expect(isValidDay('2026-07-10')).toBe(true)
    expect(isValidDay('2028-02-29')).toBe(true)
  })

  it('rejects impossible or badly formatted days', () => {
    expect(isValidDay('2027-02-29')).toBe(false)
    expect(isValidDay('2026-02-30')).toBe(false)
    expect(isValidDay('2026-7-1')).toBe(false)
    expect(isValidDay('2026-07-10T00:00')).toBe(false)
    expect(isValidDay('')).toBe(false)
  })
})

describe('day arithmetic', () => {
  it('turns the last day included into the exclusive end, and back', () => {
    expect(exclusiveEnd('2026-07-12')).toBe('2026-07-13')
    expect(exclusiveEnd('2026-02-28')).toBe('2026-03-01')
    expect(exclusiveEnd('2028-02-28')).toBe('2028-02-29')
    expect(exclusiveEnd('2026-12-31')).toBe('2027-01-01')
    expect(inclusiveEnd('2026-07-13')).toBe('2026-07-12')
    expect(inclusiveEnd('2026-03-01')).toBe('2026-02-28')
  })

  it('counts calendar days, also across the summer time switch', () => {
    expect(daysBetween('2026-07-10', '2026-07-13')).toBe(3)
    expect(daysBetween('2026-07-13', '2026-07-10')).toBe(-3)
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
    expect(addDaysTo('2026-03-28', 2)).toBe('2026-03-30')
  })

  it('round-trips through the Date used by the calendar widget', () => {
    for (const day of ['2026-07-10', '2026-03-29', '2026-10-25', '2028-02-29']) {
      expect(isoDay(dayToDate(day))).toBe(day)
    }
    expect(isoDay(new Date(2026, 6, 10))).toBe('2026-07-10')
  })
})

describe('months', () => {
  it('lists the days of a month', () => {
    expect(monthDays('2026-07')).toHaveLength(31)
    expect(monthDays('2026-02')).toHaveLength(28)
    expect(monthDays('2028-02')).toHaveLength(29)
    expect(monthDays('2026-07')[0]).toBe('2026-07-01')
    expect(monthDays('2026-07')[30]).toBe('2026-07-31')
  })

  it('parses a month parameter and rejects the rest', () => {
    expect(parseMonth('2026-07')).toBe('2026-07')
    expect(parseMonth('2026-7')).toBeNull()
    expect(parseMonth('2026-13')).toBeNull()
    expect(parseMonth('abc')).toBeNull()
    expect(parseMonth(undefined)).toBeNull()
  })

  it('moves between months across the year boundary', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })

  it('has labels for the grid header', () => {
    expect(monthTitle('2026-07')).toBe('July 2026')
    expect(dayOfMonth('2026-07-10')).toBe(10)
    expect(weekdayLetter('2026-07-10')).toBe('F')
    expect(isWeekendDay('2026-07-11')).toBe(true)
    expect(isWeekendDay('2026-07-10')).toBe(false)
  })
})

describe('rangesOverlap (end exclusive)', () => {
  const rental = { startsOn: '2026-07-10', endsOn: '2026-07-13' }

  it('overlaps when days are shared', () => {
    expect(rangesOverlap(rental, { startsOn: '2026-07-12', endsOn: '2026-07-15' })).toBe(true)
    expect(rangesOverlap(rental, { startsOn: '2026-07-11', endsOn: '2026-07-12' })).toBe(true)
  })

  it('does not overlap when one ends the day the other starts', () => {
    expect(rangesOverlap(rental, { startsOn: '2026-07-13', endsOn: '2026-07-15' })).toBe(false)
    expect(rangesOverlap(rental, { startsOn: '2026-07-08', endsOn: '2026-07-10' })).toBe(false)
  })
})

describe('buildRange', () => {
  it('turns first and last day included into start and exclusive end', () => {
    expect(buildRange('2026-07-10', '2026-07-12')).toEqual({ ok: true, startsOn: '2026-07-10', endsOn: '2026-07-13' })
  })

  it('accepts a single day', () => {
    expect(buildRange('2026-07-10', '2026-07-10')).toEqual({ ok: true, startsOn: '2026-07-10', endsOn: '2026-07-11' })
  })

  it('rejects a last day before the first, and invalid days', () => {
    expect(buildRange('2026-07-12', '2026-07-10')).toEqual({ ok: false, reason: 'end_before_start' })
    expect(buildRange('2026-02-30', '2026-03-02')).toEqual({ ok: false, reason: 'invalid_day' })
  })
})
```

- [ ] **Step 3: Esegui il test e verifica che fallisca**

Run: `npx vitest run lib/dates.test.ts`
Expected: FAIL, `Failed to resolve import "./dates"`.

- [ ] **Step 4: Scrivi l'implementazione** — `lib/dates.ts`

```ts
import { TZDate } from '@date-fns/tz'
import {
  addDays, addMonths, areIntervalsOverlapping, differenceInCalendarDays, eachDayOfInterval,
  endOfMonth, format, isValid, isWeekend, getDate, parse, startOfMonth,
} from 'date-fns'

/**
 * A calendar day as 'YYYY-MM-DD'. Never a `Date`: a Date is an instant, a rental day is not,
 * and the Vercel server runs in UTC, so after 22:00 in Rome it already sees tomorrow.
 */
export type IsoDate = string
/** A calendar month as 'YYYY-MM'. */
export type IsoMonth = string
export interface DayRange { startsOn: IsoDate; endsOn: IsoDate }

export const ROME = 'Europe/Rome'

const DAY_FORMAT = 'yyyy-MM-dd'
const MONTH_FORMAT = 'yyyy-MM'
const REFERENCE = new Date(0)

// A day string becomes a local-midnight Date only to be handed to date-fns, and goes straight
// back to a string. The two exports that return a Date (`dayToDate`, for the calendar widget)
// say so.
function parseDay(day: IsoDate): Date {
  return parse(day, DAY_FORMAT, REFERENCE)
}

function parseMonthStart(month: IsoMonth): Date {
  return parse(month, MONTH_FORMAT, REFERENCE)
}

export function todayInRome(now: Date = new Date()): IsoDate {
  return format(new TZDate(now, ROME), DAY_FORMAT)
}

export function currentMonthInRome(now: Date = new Date()): IsoMonth {
  return format(new TZDate(now, ROME), MONTH_FORMAT)
}

/** From the calendar widget (react-day-picker hands out local-midnight Dates) to a day string. */
export function isoDay(date: Date): IsoDate {
  return format(date, DAY_FORMAT)
}

/** For the calendar widget only: its `selected`, `disabled` and `defaultMonth` props want Dates. */
export function dayToDate(day: IsoDate): Date {
  return parseDay(day)
}

export function isValidDay(value: string): boolean {
  const parsed = parseDay(value)
  // date-fns accepts '2026-7-1': the round trip makes the format strict.
  return isValid(parsed) && format(parsed, DAY_FORMAT) === value
}

export function addDaysTo(day: IsoDate, amount: number): IsoDate {
  return format(addDays(parseDay(day), amount), DAY_FORMAT)
}

/** The database stores the end exclusive; people think in "last day included". */
export function exclusiveEnd(lastDay: IsoDate): IsoDate {
  return addDaysTo(lastDay, 1)
}

export function inclusiveEnd(endsOn: IsoDate): IsoDate {
  return addDaysTo(endsOn, -1)
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return differenceInCalendarDays(parseDay(to), parseDay(from))
}

export function parseMonth(value: string | undefined): IsoMonth | null {
  if (!value) return null
  const parsed = parseMonthStart(value)
  return isValid(parsed) && format(parsed, MONTH_FORMAT) === value ? value : null
}

export function shiftMonth(month: IsoMonth, by: number): IsoMonth {
  return format(addMonths(parseMonthStart(month), by), MONTH_FORMAT)
}

export function monthDays(month: IsoMonth): IsoDate[] {
  const start = startOfMonth(parseMonthStart(month))
  return eachDayOfInterval({ start, end: endOfMonth(start) }).map((date) => format(date, DAY_FORMAT))
}

export function monthTitle(month: IsoMonth): string {
  return format(parseMonthStart(month), 'LLLL yyyy')
}

export function dayOfMonth(day: IsoDate): number {
  return getDate(parseDay(day))
}

export function weekdayLetter(day: IsoDate): string {
  return format(parseDay(day), 'EEEEE')
}

export function isWeekendDay(day: IsoDate): boolean {
  return isWeekend(parseDay(day))
}

/** Ranges are [startsOn, endsOn): one that ends the day another starts does not overlap it. */
export function rangesOverlap(a: DayRange, b: DayRange): boolean {
  return areIntervalsOverlapping(
    { start: parseDay(a.startsOn), end: parseDay(a.endsOn) },
    { start: parseDay(b.startsOn), end: parseDay(b.endsOn) },
    { inclusive: false },
  )
}

export type RangeResult =
  | { ok: true; startsOn: IsoDate; endsOn: IsoDate }
  | { ok: false; reason: 'invalid_day' | 'end_before_start' }

/** First and last day included, as a person gives them, to the stored [startsOn, endsOn). */
export function buildRange(firstDay: string, lastDay: string): RangeResult {
  if (!isValidDay(firstDay) || !isValidDay(lastDay)) return { ok: false, reason: 'invalid_day' }
  if (daysBetween(firstDay, lastDay) < 0) return { ok: false, reason: 'end_before_start' }
  return { ok: true, startsOn: firstDay, endsOn: exclusiveEnd(lastDay) }
}
```

- [ ] **Step 5: Esegui il test e verifica che passi**

Run: `npx vitest run lib/dates.test.ts`
Expected: PASS, tutti i test. Se `new TZDate(now, ROME)` non compila, apri `node_modules/@date-fns/tz/index.d.ts`: il costruttore con una `Date` e il fuso come secondo argomento è quello giusto.

- [ ] **Step 6: Verifica tipi, lint e l'intera suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: tutto verde.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json lib/dates.ts lib/dates.test.ts
git commit -m "Add date-fns and lib/dates.ts: calendar days as strings, today in Rome"
```

---

## Task 2: Tabella `bike_reservations`, vincolo, RLS e prove sul database

**Files:**
- Create: `lib/pg-errors.ts`, `lib/pg-errors.test.ts`, `vitest.db.config.ts`, `tests/db/setup.ts`, `tests/db/fixtures.ts`, `tests/db/constraint.test.ts`
- Modify: `lib/db/schema.ts`, `package.json` (script `test:db`)
- Create (generato, poi completato a mano): `lib/db/migrations/0010_booking_reservations.sql`

**Interfaces:**
- Consumes: nulla (Task 1 non serve qui).
- Produces:
  - `lib/pg-errors.ts`: `EXCLUSION_VIOLATION = '23P01'`, `UNIQUE_VIOLATION = '23505'`, `FOREIGN_KEY_VIOLATION = '23503'`, `CHECK_VIOLATION = '23514'`, `pgErrorCode(error: unknown): string | undefined`.
  - `lib/db/schema.ts`: `reservationKindEnum`, `reservationStatusEnum`, `bikeReservations`, `type BikeReservation`, `type NewBikeReservation`.
  - `tests/db/fixtures.ts`: `createFixture(unitCount: number): Promise<Fixture>`, `reservationValues(...)`, `interface Fixture`.
  - script `npm run test:db`.

- [ ] **Step 1: Scrivi il test di `pgErrorCode`** — `lib/pg-errors.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { pgErrorCode, EXCLUSION_VIOLATION } from './pg-errors'

describe('pgErrorCode', () => {
  it('reads the code of a driver error', () => {
    expect(pgErrorCode({ code: '23P01' })).toBe(EXCLUSION_VIOLATION)
  })

  it('finds the code under `cause`, where Drizzle wraps the driver error', () => {
    expect(pgErrorCode(Object.assign(new Error('Failed query'), { cause: { code: '23505' } }))).toBe('23505')
  })

  it('follows a chain of causes', () => {
    expect(pgErrorCode({ cause: { cause: { code: '23503' } } })).toBe('23503')
  })

  it('returns undefined when there is no code', () => {
    expect(pgErrorCode(new Error('boom'))).toBeUndefined()
    expect(pgErrorCode(null)).toBeUndefined()
    expect(pgErrorCode('text')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Esegui e verifica che fallisca**

Run: `npx vitest run lib/pg-errors.test.ts`
Expected: FAIL, import non risolto.

- [ ] **Step 3: Implementa** — `lib/pg-errors.ts`

```ts
// SQLSTATE codes this codebase reacts to.
export const EXCLUSION_VIOLATION = '23P01'
export const UNIQUE_VIOLATION = '23505'
export const FOREIGN_KEY_VIOLATION = '23503'
export const CHECK_VIOLATION = '23514'

/**
 * The Postgres error code of a failed query. Drizzle wraps the driver's error, so the code
 * is on `cause`, not on the error that is thrown.
 */
export function pgErrorCode(error: unknown): string | undefined {
  let current: unknown = error
  for (let depth = 0; depth < 5 && current !== null && typeof current === 'object'; depth++) {
    const code = (current as { code?: unknown }).code
    if (typeof code === 'string') return code
    current = (current as { cause?: unknown }).cause
  }
  return undefined
}
```

- [ ] **Step 4: Esegui e verifica che passi**

Run: `npx vitest run lib/pg-errors.test.ts`
Expected: PASS (4 test).

- [ ] **Step 5: Aggiungi la tabella allo schema** — `lib/db/schema.ts`

Nell'import di `drizzle-orm/pg-core` in cima aggiungi `date`:

```ts
import {
  pgTable, text, integer, numeric, boolean,
  timestamp, uuid, pgEnum, index, unique, date
} from 'drizzle-orm/pg-core'
```

Dopo `export type NewBikeUnit = typeof bikeUnits.$inferInsert` aggiungi:

```ts
export const reservationKindEnum = pgEnum('reservation_kind', ['counter_rental', 'maintenance'])
export const reservationStatusEnum = pgEnum('reservation_status', ['confirmed', 'cancelled'])

// One row per bike and period: a rental at the counter, or a maintenance block. The rule that
// two `confirmed` rows on the same bike cannot overlap lives in the database (an EXCLUDE
// constraint on `during`), added by hand in migration 0010 because Drizzle generates neither
// exclusion constraints nor generated columns. `during` is that generated daterange,
// [starts_on, ends_on): it is deliberately not declared here, the app only ever reads the two dates.
//
// `ends_on` is exclusive: a rental from the 10th to the 12th included is ends_on = the 13th.
// `request_key` is the idempotency key the form generates when it opens: a repeated submit
// finds the row instead of creating a second one.
export const bikeReservations = pgTable('bike_reservations', {
  id:          uuid('id').primaryKey().defaultRandom(),
  bikeUnitId:  uuid('bike_unit_id').notNull().references(() => bikeUnits.id),
  kind:        reservationKindEnum('kind').notNull(),
  status:      reservationStatusEnum('status').notNull().default('confirmed'),
  startsOn:    date('starts_on', { mode: 'string' }).notNull(),
  endsOn:      date('ends_on', { mode: 'string' }).notNull(),
  label:       text('label'),
  requestKey:  uuid('request_key').notNull().unique(),
  createdAt:   timestamp('created_at').notNull().defaultNow(),
}, (t) => [index('bike_reservations_unit_starts_idx').on(t.bikeUnitId, t.startsOn)])

export type BikeReservation = typeof bikeReservations.$inferSelect
export type NewBikeReservation = typeof bikeReservations.$inferInsert
```

- [ ] **Step 6: Genera la migrazione**

Run: `npx drizzle-kit generate --name booking_reservations`
Expected: crea `lib/db/migrations/0010_booking_reservations.sql` con due `CREATE TYPE`, `CREATE TABLE "bike_reservations"`, la chiave esterna, l'indice, il vincolo `UNIQUE` su `request_key`. Verifica con `ls lib/db/migrations | tail -3`.

- [ ] **Step 7: Completa a mano la migrazione**

Apri `lib/db/migrations/0010_booking_reservations.sql` e **in fondo** aggiungi (ogni istruzione separata da `--> statement-breakpoint`):

```sql
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
--> statement-breakpoint
ALTER TABLE "bike_reservations" ADD COLUMN "during" daterange GENERATED ALWAYS AS (daterange("starts_on", "ends_on", '[)')) STORED;
--> statement-breakpoint
ALTER TABLE "bike_reservations" ADD CONSTRAINT "bike_reservations_no_overlap" EXCLUDE USING gist ("bike_unit_id" extensions.gist_uuid_ops WITH =, "during" WITH &&) WHERE ("status" = 'confirmed');
--> statement-breakpoint
ALTER TABLE "bike_reservations" ADD CONSTRAINT "bike_reservations_range_check" CHECK ("ends_on" > "starts_on");
--> statement-breakpoint
-- Explicit, not left to the ensure_rls event trigger: production has it, development and
-- Preview do not, and a table born open there is reachable with the anon key through PostgREST.
-- No policies on purpose: the app connects as `postgres`, which bypasses RLS.
ALTER TABLE "bike_reservations" ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 8: Applica la migrazione al database di sviluppo**

Run: `npm run db:migrate`
Expected: termina senza errori. (`db:migrate` legge `DATABASE_DIRECT_URL` da `.env.local`, cioè il database di sviluppo, che è anche quello di Preview.) Se `CREATE EXTENSION` fallisce per permessi, abilita `btree_gist` dalla dashboard Supabase (Database → Extensions) e rilancia.

Verifica sul database (MCP `supabase-dev`, `execute_sql`):

```sql
select conname, contype from pg_constraint where conrelid = 'public.bike_reservations'::regclass order by conname;
select relrowsecurity from pg_class where oid = 'public.bike_reservations'::regclass;
```
Expected: i vincoli `bike_reservations_bike_unit_id_bike_units_id_fk` (f), `bike_reservations_no_overlap` (x), `bike_reservations_pkey` (p), `bike_reservations_range_check` (c), `bike_reservations_request_key_unique` (u); `relrowsecurity = true`.

- [ ] **Step 9: Predisponi le prove contro il database** — `vitest.db.config.ts`

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

/**
 * Tests that talk to the DEVELOPMENT database: `npm run test:db`.
 *
 * Kept out of `npm test` and out of CI on purpose: CI's checks need no services and no secrets.
 * They insert and delete rows, so tests/db/setup.ts refuses to run against production.
 */
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: {
    include: ['tests/db/**/*.test.ts'],
    setupFiles: ['tests/db/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
})
```

In `package.json`, nella sezione `scripts`, dopo `"test:watch": "vitest",` aggiungi:

```json
    "test:db": "node --env-file=.env.local node_modules/vitest/vitest.mjs run --config vitest.db.config.ts",
```

Run: `ls node_modules/vitest/vitest.mjs`
Expected: il file esiste. Se no, usa il percorso mostrato da `npx vitest --help` (la posizione dell'eseguibile) nello script.

- [ ] **Step 10: Rete di sicurezza e fixture** — `tests/db/setup.ts`

```ts
// These tests insert and delete rows. They must only ever run against the development database.
const url = process.env.DATABASE_URL ?? ''
if (!url) throw new Error('DATABASE_URL is missing: run these tests with `npm run test:db`')
if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
  throw new Error('Database tests never run in production')
}
// The production Supabase project (docs/environment-variables.md).
if (url.includes('hhfnhzdourgkinwlqvtc')) {
  throw new Error('DATABASE_URL points at the production project: refusing to run')
}
```

`tests/db/fixtures.ts`:

```ts
import { eq, inArray } from 'drizzle-orm'
import {
  db, bikeCategories, bikeModels, bikeSizes, bikeVersions, bikeUnits, bikeReservations,
  type NewBikeReservation,
} from '@/lib/db'

export interface Fixture {
  modelId: string
  sizeId: string
  versionId: string
  unitIds: string[]
  cleanup: () => Promise<void>
}

/** A category, a model, a size, a version and `unitCount` bikes, all of them removed by `cleanup`. */
export async function createFixture(unitCount: number): Promise<Fixture> {
  const tag = `db-test-${crypto.randomUUID()}`
  const [category] = await db.insert(bikeCategories)
    .values({ name: tag, maxRentalDays: 7, day1Price: '10' }).returning()
  const [model] = await db.insert(bikeModels).values({ categoryId: category.id }).returning()
  const [size] = await db.insert(bikeSizes).values({ name: tag }).returning()
  const [version] = await db.insert(bikeVersions).values({ name: tag }).returning()
  const units = await db.insert(bikeUnits).values(
    Array.from({ length: unitCount }, () => ({
      bikeModelId: model.id, bikeSizeId: size.id, bikeVersionId: version.id,
    })),
  ).returning()
  const unitIds = units.map((unit) => unit.id)

  return {
    modelId: model.id,
    sizeId: size.id,
    versionId: version.id,
    unitIds,
    cleanup: async () => {
      await db.delete(bikeReservations).where(inArray(bikeReservations.bikeUnitId, unitIds))
      await db.delete(bikeUnits).where(inArray(bikeUnits.id, unitIds))
      await db.delete(bikeModels).where(eq(bikeModels.id, model.id))
      await db.delete(bikeSizes).where(eq(bikeSizes.id, size.id))
      await db.delete(bikeVersions).where(eq(bikeVersions.id, version.id))
      await db.delete(bikeCategories).where(eq(bikeCategories.id, category.id))
    },
  }
}

/** Insert values for a reservation, with a fresh idempotency key. */
export function reservationValues(
  bikeUnitId: string, startsOn: string, endsOn: string, overrides: Partial<NewBikeReservation> = {},
): NewBikeReservation {
  return {
    bikeUnitId, kind: 'counter_rental', status: 'confirmed', startsOn, endsOn,
    label: 'db-test', requestKey: crypto.randomUUID(), ...overrides,
  }
}
```

- [ ] **Step 11: Scrivi le prove del vincolo** — `tests/db/constraint.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { db, bikeReservations } from '@/lib/db'
import {
  CHECK_VIOLATION, EXCLUSION_VIOLATION, FOREIGN_KEY_VIOLATION, UNIQUE_VIOLATION, pgErrorCode,
} from '@/lib/pg-errors'
import { createFixture, reservationValues, type Fixture } from './fixtures'

async function failureCode(run: PromiseLike<unknown>): Promise<string | undefined> {
  try {
    await run
  } catch (error) {
    return pgErrorCode(error)
  }
  return undefined
}

describe('bike_reservations constraints', () => {
  let fx: Fixture
  beforeEach(async () => { fx = await createFixture(2) })
  afterEach(async () => { await fx.cleanup() })

  const insert = (values: ReturnType<typeof reservationValues>) => db.insert(bikeReservations).values(values)

  it('rejects two confirmed rows on the same bike with overlapping days', async () => {
    await insert(reservationValues(fx.unitIds[0], '2031-07-10', '2031-07-13'))
    const code = await failureCode(insert(reservationValues(fx.unitIds[0], '2031-07-12', '2031-07-15')))
    expect(code).toBe(EXCLUSION_VIOLATION)
  })

  it('allows the day after a rental ends, and the days before one starts', async () => {
    await insert(reservationValues(fx.unitIds[0], '2031-07-10', '2031-07-13'))
    expect(await failureCode(insert(reservationValues(fx.unitIds[0], '2031-07-13', '2031-07-15')))).toBeUndefined()
    expect(await failureCode(insert(reservationValues(fx.unitIds[0], '2031-07-08', '2031-07-10')))).toBeUndefined()
  })

  it('allows the same days on a different bike', async () => {
    await insert(reservationValues(fx.unitIds[0], '2031-07-10', '2031-07-13'))
    expect(await failureCode(insert(reservationValues(fx.unitIds[1], '2031-07-10', '2031-07-13')))).toBeUndefined()
  })

  it('lets a cancelled row go: it does not block the days', async () => {
    await insert(reservationValues(fx.unitIds[0], '2031-07-10', '2031-07-13', { status: 'cancelled' }))
    expect(await failureCode(insert(reservationValues(fx.unitIds[0], '2031-07-10', '2031-07-13')))).toBeUndefined()
  })

  it('treats a maintenance block like any other reservation', async () => {
    await insert(reservationValues(fx.unitIds[0], '2031-07-10', '2031-07-13', { kind: 'maintenance' }))
    expect(await failureCode(insert(reservationValues(fx.unitIds[0], '2031-07-11', '2031-07-12')))).toBe(EXCLUSION_VIOLATION)
  })

  it('rejects an empty or reversed range', async () => {
    expect(await failureCode(insert(reservationValues(fx.unitIds[0], '2031-07-10', '2031-07-10')))).toBe(CHECK_VIOLATION)
    expect(await failureCode(insert(reservationValues(fx.unitIds[0], '2031-07-12', '2031-07-10')))).toBe(CHECK_VIOLATION)
  })

  it('rejects a repeated idempotency key', async () => {
    const requestKey = crypto.randomUUID()
    await insert(reservationValues(fx.unitIds[0], '2031-07-10', '2031-07-13', { requestKey }))
    expect(await failureCode(insert(reservationValues(fx.unitIds[1], '2031-08-10', '2031-08-13', { requestKey })))).toBe(UNIQUE_VIOLATION)
  })

  it('exposes the generated range as [starts_on, ends_on)', async () => {
    await insert(reservationValues(fx.unitIds[0], '2031-07-10', '2031-07-13'))
    const rows = await db.execute<{ during: string }>(sql`
      select during::text as during from bike_reservations where bike_unit_id = ${fx.unitIds[0]}::uuid`)
    expect(rows[0].during).toBe('[2031-07-10,2031-07-13)')
  })

  it('does not let a bike with reservations be deleted', async () => {
    await insert(reservationValues(fx.unitIds[0], '2031-07-10', '2031-07-13', { status: 'cancelled' }))
    const code = await failureCode(db.execute(sql`delete from bike_units where id = ${fx.unitIds[0]}::uuid`))
    expect(code).toBe(FOREIGN_KEY_VIOLATION)
  })

  it('has row level security on, so the anon key cannot read or write it', async () => {
    const rows = await db.execute<{ relrowsecurity: boolean }>(sql`
      select relrowsecurity from pg_class where oid = 'public.bike_reservations'::regclass`)
    expect(rows[0].relrowsecurity).toBe(true)
  })
})
```

- [ ] **Step 12: Esegui le prove sul database di sviluppo**

Run: `npm run test:db`
Expected: PASS, 10 test in `tests/db/constraint.test.ts`. Se `failureCode` restituisce `undefined` dove si aspetta un codice, controlla che `lib/db/migrations/0010_booking_reservations.sql` abbia le righe a mano del Step 7 e che `npm run db:migrate` le abbia applicate.

- [ ] **Step 13: Verifica tipi, lint e suite unitaria**

Run: `npm run typecheck && npm run lint && npm test`
Expected: tutto verde (`npm test` non esegue `tests/db`).

- [ ] **Step 14: Commit**

```bash
git add lib/pg-errors.ts lib/pg-errors.test.ts lib/db/schema.ts lib/db/migrations vitest.db.config.ts tests/db package.json
git commit -m "Add bike_reservations with the exclusion constraint, explicit RLS, and database tests"
```

---

## Task 3: Il livello dati `lib/reservations.ts`

**Files:**
- Create: `lib/reservations.ts`, `tests/db/reservations.test.ts`

**Interfaces:**
- Consumes: Task 1 (`exclusiveEnd`, `inclusiveEnd`, `monthDays`, `daysBetween`, tipi), Task 2 (`bikeReservations`, `pgErrorCode`, codici, `createFixture`, `reservationValues`).
- Produces (usati da Task 4, 6, 8, 9):

```ts
type ReservationKind = 'counter_rental' | 'maintenance'
interface ReservationSummary { id: string; bikeUnitId: string; kind: ReservationKind; startsOn: IsoDate; endsOn: IsoDate; label: string | null }

interface CreateRentalInput { requestKey: string; bikeModelId: string; bikeSizeId: string; bikeVersionId: string; startsOn: IsoDate; endsOn: IsoDate; label: string; confirmDuplicate: boolean }
type CreateRentalResult =
  | { status: 'created'; reservationId: string; bikeUnitId: string; replayed: boolean }
  | { status: 'possible_duplicate'; existing: ReservationSummary }
  | { status: 'no_bike_free' }
  | { status: 'try_again' }
createCounterRental(input: CreateRentalInput): Promise<CreateRentalResult>

type CancelResult = { status: 'cancelled' } | { status: 'not_found' }
cancelReservation(id: string): Promise<CancelResult>

type MoveResult = { status: 'moved' } | { status: 'conflict' } | { status: 'not_found' } | { status: 'unknown_bike' }
moveReservation(id: string, bikeUnitId: string): Promise<MoveResult>

interface MoveCandidate { bikeUnitId: string; shortId: string; modelName: string; sizeName: string; versionName: string; sameModelAndSize: boolean }
getMoveCandidates(reservationId: string): Promise<MoveCandidate[]>

interface PlanMaintenanceInput { requestKey: string; bikeUnitId: string; startsOn: IsoDate; endsOn: IsoDate; label: string | null }
type MaintenanceResult =
  | { status: 'planned'; reservationId: string; replayed: boolean }
  | { status: 'conflict'; conflicts: ReservationSummary[] }
  | { status: 'unknown_bike' }
planMaintenance(input: PlanMaintenanceInput): Promise<MaintenanceResult>

type UpdateMaintenanceResult = { status: 'updated' } | { status: 'conflict'; conflicts: ReservationSummary[] } | { status: 'not_found' }
updateMaintenance(id: string, startsOn: IsoDate, endsOn: IsoDate): Promise<UpdateMaintenanceResult>

getOccupiedRanges(bikeUnitId: string, excludeReservationId?: string): Promise<DayRange[]>

interface GridReservation { id: string; kind: ReservationKind; startsOn: IsoDate; endsOn: IsoDate; label: string | null }
interface GridUnit { id: string; shortId: string; modelName: string; sizeName: string; versionName: string; reservations: GridReservation[] }
getGrid(month: IsoMonth): Promise<GridUnit[]>

interface MaintenanceInfo { startsOn: IsoDate; endsOn: IsoDate; active: boolean }
getMaintenanceByUnit(today: IsoDate): Promise<Record<string, MaintenanceInfo>>

type DeleteBikeResult = { status: 'deleted' } | { status: 'has_reservations' }
deleteBikeUnitUnlessReserved(id: string): Promise<DeleteBikeResult>
```

- [ ] **Step 1: Scrivi le prove sul database** — `tests/db/reservations.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db, bikeReservations, bikeUnits } from '@/lib/db'
import {
  cancelReservation, createCounterRental, deleteBikeUnitUnlessReserved, getGrid, getMaintenanceByUnit,
  getMoveCandidates, getOccupiedRanges, moveReservation, planMaintenance, updateMaintenance,
  type CreateRentalInput,
} from '@/lib/reservations'
import { createFixture, type Fixture } from './fixtures'

const RANGE = { startsOn: '2031-07-10', endsOn: '2031-07-13' }

function rental(fx: Fixture, overrides: Partial<CreateRentalInput> = {}): CreateRentalInput {
  return {
    requestKey: crypto.randomUUID(), bikeModelId: fx.modelId, bikeSizeId: fx.sizeId,
    bikeVersionId: fx.versionId, ...RANGE, label: 'Rossi', confirmDuplicate: false, ...overrides,
  }
}

function created(result: Awaited<ReturnType<typeof createCounterRental>>) {
  if (result.status !== 'created') throw new Error(`expected created, got ${result.status}`)
  return result
}

describe('createCounterRental', () => {
  let fx: Fixture
  beforeEach(async () => { fx = await createFixture(3) })
  afterEach(async () => { await fx.cleanup() })

  it('assigns a free bike of the requested model, size and version', async () => {
    const result = created(await createCounterRental(rental(fx)))
    expect(fx.unitIds).toContain(result.bikeUnitId)
    expect(result.replayed).toBe(false)
  })

  it('returns the same reservation when the same key is submitted twice', async () => {
    const input = rental(fx)
    const first = created(await createCounterRental(input))
    const second = created(await createCounterRental(input))
    expect(second.reservationId).toBe(first.reservationId)
    expect(second.replayed).toBe(true)
    const rows = await db.select().from(bikeReservations).where(eq(bikeReservations.requestKey, input.requestKey))
    expect(rows).toHaveLength(1)
  })

  it('warns about a possible duplicate: same name, model, size and overlapping days', async () => {
    created(await createCounterRental(rental(fx, { label: 'Rossi' })))
    const result = await createCounterRental(rental(fx, { label: '  rossi ', startsOn: '2031-07-11', endsOn: '2031-07-14' }))
    expect(result.status).toBe('possible_duplicate')
  })

  it('compares names without caring for case or accents on the capital', async () => {
    created(await createCounterRental(rental(fx, { label: 'Élodie' })))
    const result = await createCounterRental(rental(fx, { label: 'élodie ' }))
    expect(result.status).toBe('possible_duplicate')
  })

  it('creates the second rental when the duplicate is confirmed, on another bike', async () => {
    const first = created(await createCounterRental(rental(fx, { label: 'Rossi' })))
    const second = created(await createCounterRental(rental(fx, { label: 'Rossi', confirmDuplicate: true })))
    expect(second.bikeUnitId).not.toBe(first.bikeUnitId)
  })

  it('does not warn for a different name, or for the same name on other days', async () => {
    created(await createCounterRental(rental(fx, { label: 'Rossi' })))
    expect((await createCounterRental(rental(fx, { label: 'Bianchi' }))).status).toBe('created')
    expect((await createCounterRental(rental(fx, { label: 'Rossi', startsOn: '2031-08-01', endsOn: '2031-08-03' }))).status).toBe('created')
  })

  it('answers no_bike_free when every bike is taken', async () => {
    for (const name of ['A', 'B', 'C']) created(await createCounterRental(rental(fx, { label: name })))
    expect((await createCounterRental(rental(fx, { label: 'D' }))).status).toBe('no_bike_free')
  })

  it('answers no_bike_free for a model with no bikes at all', async () => {
    const empty = await createFixture(0)
    try {
      expect((await createCounterRental(rental(empty))).status).toBe('no_bike_free')
    } finally {
      await empty.cleanup()
    }
  })

  it('never assigns a bike that is in maintenance', async () => {
    for (const unitId of fx.unitIds.slice(0, 2)) {
      await planMaintenance({ requestKey: crypto.randomUUID(), bikeUnitId: unitId, ...RANGE, label: null })
    }
    const result = created(await createCounterRental(rental(fx, { label: 'A' })))
    expect(result.bikeUnitId).toBe(fx.unitIds[2])
    expect((await createCounterRental(rental(fx, { label: 'B' }))).status).toBe('no_bike_free')
  })

  it('lets the same bike be rented the day after a rental ends', async () => {
    const single = await createFixture(1)
    try {
      const first = created(await createCounterRental(rental(single, { label: 'A' })))
      const second = created(await createCounterRental(rental(single, { label: 'B', startsOn: '2031-07-13', endsOn: '2031-07-15' })))
      expect(second.bikeUnitId).toBe(first.bikeUnitId)
    } finally {
      await single.cleanup()
    }
  })

  it('gives each of many simultaneous requests its own bike, and no more bikes than exist', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => createCounterRental(rental(fx, { label: `cliente-${i}` }))),
    )
    const winners = results.filter((r) => r.status === 'created')
    expect(winners).toHaveLength(3)
    const bikes = winners.map((r) => (r.status === 'created' ? r.bikeUnitId : ''))
    expect(new Set(bikes).size).toBe(3)
    expect(results.every((r) => ['created', 'no_bike_free', 'try_again'].includes(r.status))).toBe(true)
  })
})

describe('cancelReservation and moveReservation', () => {
  let fx: Fixture
  beforeEach(async () => { fx = await createFixture(3) })
  afterEach(async () => { await fx.cleanup() })

  it('cancels, and a second cancel finds nothing', async () => {
    const { reservationId } = created(await createCounterRental(rental(fx)))
    expect(await cancelReservation(reservationId)).toEqual({ status: 'cancelled' })
    expect(await cancelReservation(reservationId)).toEqual({ status: 'not_found' })
  })

  it('frees the days when cancelled', async () => {
    const single = await createFixture(1)
    try {
      const { reservationId } = created(await createCounterRental(rental(single, { label: 'A' })))
      await cancelReservation(reservationId)
      expect((await createCounterRental(rental(single, { label: 'B' }))).status).toBe('created')
    } finally {
      await single.cleanup()
    }
  })

  it('moves a rental to a free bike', async () => {
    const { reservationId, bikeUnitId } = created(await createCounterRental(rental(fx)))
    const target = fx.unitIds.find((id) => id !== bikeUnitId)!
    expect(await moveReservation(reservationId, target)).toEqual({ status: 'moved' })
    const [row] = await db.select().from(bikeReservations).where(eq(bikeReservations.id, reservationId))
    expect(row.bikeUnitId).toBe(target)
  })

  it('refuses to move onto a bike that is taken in those days', async () => {
    const a = created(await createCounterRental(rental(fx, { label: 'A' })))
    const b = created(await createCounterRental(rental(fx, { label: 'B' })))
    expect(await moveReservation(a.reservationId, b.bikeUnitId)).toEqual({ status: 'conflict' })
  })

  it('answers unknown_bike for a bike that does not exist, and not_found for a cancelled rental', async () => {
    const { reservationId } = created(await createCounterRental(rental(fx)))
    expect(await moveReservation(reservationId, crypto.randomUUID())).toEqual({ status: 'unknown_bike' })
    await cancelReservation(reservationId)
    expect(await moveReservation(reservationId, fx.unitIds[0])).toEqual({ status: 'not_found' })
  })

  it('offers bikes of the same model and size first', async () => {
    const other = await createFixture(1)
    try {
      const { reservationId } = created(await createCounterRental(rental(fx)))
      const candidates = await getMoveCandidates(reservationId)
      // The development database also holds the shop's real bikes: look only at ours.
      const ours = candidates.filter((c) => fx.unitIds.includes(c.bikeUnitId) || other.unitIds.includes(c.bikeUnitId))
      const firstOther = ours.findIndex((c) => other.unitIds.includes(c.bikeUnitId))
      const lastSame = ours.map((c) => c.sameModelAndSize).lastIndexOf(true)

      expect(ours.filter((c) => fx.unitIds.includes(c.bikeUnitId)).every((c) => c.sameModelAndSize)).toBe(true)
      expect(ours[firstOther].sameModelAndSize).toBe(false)
      expect(lastSame).toBeLessThan(firstOther)
    } finally {
      await other.cleanup()
    }
  })
})

describe('maintenance', () => {
  let fx: Fixture
  beforeEach(async () => { fx = await createFixture(2) })
  afterEach(async () => { await fx.cleanup() })

  const plan = (unitId: string, startsOn: string, endsOn: string, requestKey = crypto.randomUUID()) =>
    planMaintenance({ requestKey, bikeUnitId: unitId, startsOn, endsOn, label: 'chain' })

  it('plans a block, and the same key again returns the same one', async () => {
    const requestKey = crypto.randomUUID()
    const first = await plan(fx.unitIds[0], '2031-07-10', '2031-07-13', requestKey)
    const second = await plan(fx.unitIds[0], '2031-07-10', '2031-07-13', requestKey)
    expect(first.status).toBe('planned')
    expect(second).toMatchObject({ status: 'planned', replayed: true })
    if (first.status === 'planned' && second.status === 'planned') expect(second.reservationId).toBe(first.reservationId)
  })

  it('refuses days that are already rented, and lists the rentals in the way', async () => {
    const single = await createFixture(1)
    try {
      created(await createCounterRental(rental(single, { label: 'Rossi' })))
      const result = await plan(single.unitIds[0], '2031-07-11', '2031-07-20')
      expect(result.status).toBe('conflict')
      if (result.status === 'conflict') {
        expect(result.conflicts).toHaveLength(1)
        expect(result.conflicts[0]).toMatchObject({ label: 'Rossi', startsOn: '2031-07-10', endsOn: '2031-07-13' })
      }
    } finally {
      await single.cleanup()
    }
  })

  it('answers unknown_bike for a bike that does not exist', async () => {
    expect((await plan(crypto.randomUUID(), '2031-07-10', '2031-07-13')).status).toBe('unknown_bike')
  })

  it('updates the dates, refuses to grow into a rental, and can be cancelled', async () => {
    const single = await createFixture(1)
    try {
      created(await createCounterRental(rental(single, { label: 'Rossi', startsOn: '2031-07-20', endsOn: '2031-07-23' })))
      const planned = await plan(single.unitIds[0], '2031-07-10', '2031-07-13')
      if (planned.status !== 'planned') throw new Error('expected planned')
      expect(await updateMaintenance(planned.reservationId, '2031-07-10', '2031-07-15')).toEqual({ status: 'updated' })
      expect((await updateMaintenance(planned.reservationId, '2031-07-10', '2031-07-25')).status).toBe('conflict')
      expect(await cancelReservation(planned.reservationId)).toEqual({ status: 'cancelled' })
      expect(await updateMaintenance(planned.reservationId, '2031-07-10', '2031-07-15')).toEqual({ status: 'not_found' })
    } finally {
      await single.cleanup()
    }
  })

  it('reports occupied ranges of a bike, leaving out the one being edited', async () => {
    const single = await createFixture(1)
    try {
      const a = created(await createCounterRental(rental(single, { label: 'A' })))
      const planned = await plan(single.unitIds[0], '2031-08-01', '2031-08-05')
      if (planned.status !== 'planned') throw new Error('expected planned')
      expect(await getOccupiedRanges(single.unitIds[0])).toHaveLength(2)
      expect(await getOccupiedRanges(single.unitIds[0], planned.reservationId)).toEqual([RANGE])
      expect(a.reservationId).toBeTruthy()
    } finally {
      await single.cleanup()
    }
  })

  it('shows the current or next maintenance of each bike', async () => {
    await plan(fx.unitIds[0], '2031-07-10', '2031-07-13')
    await plan(fx.unitIds[1], '2031-09-01', '2031-09-05')
    const info = await getMaintenanceByUnit('2031-07-11')
    expect(info[fx.unitIds[0]]).toEqual({ startsOn: '2031-07-10', endsOn: '2031-07-13', active: true })
    expect(info[fx.unitIds[1]]).toEqual({ startsOn: '2031-09-01', endsOn: '2031-09-05', active: false })
    expect((await getMaintenanceByUnit('2031-07-13'))[fx.unitIds[0]]).toBeUndefined()
  })
})

describe('getGrid', () => {
  let fx: Fixture
  beforeEach(async () => { fx = await createFixture(1) })
  afterEach(async () => { await fx.cleanup() })

  const mine = async (month: string) => (await getGrid(month)).find((u) => u.id === fx.unitIds[0])!

  it('shows a reservation in every month it touches, and not in the others', async () => {
    created(await createCounterRental(rental(fx, { startsOn: '2031-06-28', endsOn: '2031-07-03' })))
    expect((await mine('2031-06')).reservations).toHaveLength(1)
    expect((await mine('2031-07')).reservations).toHaveLength(1)
    expect((await mine('2031-08')).reservations).toHaveLength(0)
    expect((await mine('2031-05')).reservations).toHaveLength(0)
  })

  it('does not show a reservation that ends the day the month starts, or starts the day it ends', async () => {
    created(await createCounterRental(rental(fx, { label: 'A', startsOn: '2031-06-28', endsOn: '2031-07-01' })))
    created(await createCounterRental(rental(fx, { label: 'B', startsOn: '2031-08-01', endsOn: '2031-08-03' })))
    expect((await mine('2031-07')).reservations).toHaveLength(0)
  })

  it('leaves out cancelled reservations', async () => {
    const { reservationId } = created(await createCounterRental(rental(fx)))
    await cancelReservation(reservationId)
    expect((await mine('2031-07')).reservations).toHaveLength(0)
  })

  it('labels the bike with its short id', async () => {
    expect((await mine('2031-07')).shortId).toBe(fx.unitIds[0].slice(0, 8))
  })
})

describe('deleteBikeUnitUnlessReserved', () => {
  let fx: Fixture
  beforeEach(async () => { fx = await createFixture(2) })
  afterEach(async () => { await fx.cleanup() })

  it('deletes a bike that never had a reservation', async () => {
    expect(await deleteBikeUnitUnlessReserved(fx.unitIds[1])).toEqual({ status: 'deleted' })
    const rows = await db.select().from(bikeUnits).where(and(eq(bikeUnits.id, fx.unitIds[1])))
    expect(rows).toHaveLength(0)
  })

  it('refuses when the bike has reservations, even a cancelled one', async () => {
    const { reservationId, bikeUnitId } = created(await createCounterRental(rental(fx)))
    await cancelReservation(reservationId)
    expect(await deleteBikeUnitUnlessReserved(bikeUnitId)).toEqual({ status: 'has_reservations' })
    const rows = await db.select().from(bikeUnits).where(eq(bikeUnits.id, bikeUnitId))
    expect(rows).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Esegui e verifica che fallisca**

Run: `npm run test:db -- tests/db/reservations.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/reservations"`.

- [ ] **Step 3: Implementa il livello dati** — `lib/reservations.ts`

```ts
import { and, asc, eq, gt, lt, ne, sql } from 'drizzle-orm'
import {
  db, bikeReservations, bikeUnits, bikeModelTranslations, bikeSizes, bikeVersions,
  type BikeReservation,
} from '@/lib/db'
import { EXCLUSION_VIOLATION, FOREIGN_KEY_VIOLATION, pgErrorCode } from '@/lib/pg-errors'
import { daysBetween, exclusiveEnd, monthDays, type DayRange, type IsoDate, type IsoMonth } from '@/lib/dates'

/*
 * Every operation here is ONE statement: this client cannot open a transaction (max_pipeline: 0,
 * see lib/db/client-options.ts). The database has the last word on double bookings, through the
 * `bike_reservations_no_overlap` exclusion constraint; code that loses a race gets `23P01` and
 * picks again.
 */

export type ReservationKind = BikeReservation['kind']

export interface ReservationSummary {
  id: string
  bikeUnitId: string
  kind: ReservationKind
  startsOn: IsoDate
  endsOn: IsoDate
  label: string | null
}

function summary(row: BikeReservation): ReservationSummary {
  return {
    id: row.id, bikeUnitId: row.bikeUnitId, kind: row.kind,
    startsOn: row.startsOn, endsOn: row.endsOn, label: row.label,
  }
}

async function findByRequestKey(requestKey: string): Promise<BikeReservation | undefined> {
  const [row] = await db.select().from(bikeReservations).where(eq(bikeReservations.requestKey, requestKey))
  return row
}

async function findOverlaps(
  bikeUnitId: string, startsOn: IsoDate, endsOn: IsoDate, excludeId?: string,
): Promise<ReservationSummary[]> {
  const rows = await db.select().from(bikeReservations).where(and(
    eq(bikeReservations.bikeUnitId, bikeUnitId),
    eq(bikeReservations.status, 'confirmed'),
    lt(bikeReservations.startsOn, endsOn),
    gt(bikeReservations.endsOn, startsOn),
    excludeId ? ne(bikeReservations.id, excludeId) : undefined,
  )).orderBy(asc(bikeReservations.startsOn))
  return rows.map(summary)
}

// ---------------------------------------------------------------------------------------------
// Rentals at the counter

const MAX_ATTEMPTS = 8

export interface CreateRentalInput {
  requestKey: string
  bikeModelId: string
  bikeSizeId: string
  bikeVersionId: string
  startsOn: IsoDate
  endsOn: IsoDate
  label: string
  confirmDuplicate: boolean
}

export type CreateRentalResult =
  | { status: 'created'; reservationId: string; bikeUnitId: string; replayed: boolean }
  | { status: 'possible_duplicate'; existing: ReservationSummary }
  | { status: 'no_bike_free' }
  | { status: 'try_again' }

/**
 * The case the exclusion constraint cannot see: the same rental typed twice, with two free
 * bikes, takes two DIFFERENT bikes without any error. Same name (ignoring case and surrounding
 * spaces), same model and size, overlapping days.
 */
async function findPossibleDuplicate(input: CreateRentalInput): Promise<ReservationSummary | null> {
  const rows = await db.execute<{
    id: string; bike_unit_id: string; starts_on: string; ends_on: string; label: string | null
  }>(sql`
    select r.id, r.bike_unit_id, r.starts_on::text as starts_on, r.ends_on::text as ends_on, r.label
    from bike_reservations r
    join bike_units u on u.id = r.bike_unit_id
    where r.kind = 'counter_rental' and r.status = 'confirmed'
      and lower(btrim(r.label)) = lower(btrim(${input.label}::text))
      and u.bike_model_id = ${input.bikeModelId}::uuid
      and u.bike_size_id = ${input.bikeSizeId}::uuid
      and r.starts_on < ${input.endsOn}::date and ${input.startsOn}::date < r.ends_on
    limit 1`)
  const row = rows[0]
  if (!row) return null
  return {
    id: row.id, bikeUnitId: row.bike_unit_id, kind: 'counter_rental',
    startsOn: row.starts_on, endsOn: row.ends_on, label: row.label,
  }
}

export async function createCounterRental(input: CreateRentalInput): Promise<CreateRentalResult> {
  const replay = await findByRequestKey(input.requestKey)
  if (replay) {
    return { status: 'created', reservationId: replay.id, bikeUnitId: replay.bikeUnitId, replayed: true }
  }

  if (!input.confirmDuplicate) {
    const existing = await findPossibleDuplicate(input)
    if (existing) return { status: 'possible_duplicate', existing }
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const rows = await db.execute<{ id: string; bike_unit_id: string }>(sql`
        insert into bike_reservations (bike_unit_id, kind, status, starts_on, ends_on, label, request_key)
        select u.id, 'counter_rental'::reservation_kind, 'confirmed'::reservation_status,
               ${input.startsOn}::date, ${input.endsOn}::date, ${input.label}::text, ${input.requestKey}::uuid
        from bike_units u
        where u.bike_model_id = ${input.bikeModelId}::uuid
          and u.bike_size_id = ${input.bikeSizeId}::uuid
          and u.bike_version_id = ${input.bikeVersionId}::uuid
          and not exists (
            select 1 from bike_reservations r
            where r.bike_unit_id = u.id and r.status = 'confirmed'
              and r.during && daterange(${input.startsOn}::date, ${input.endsOn}::date, '[)'))
        order by u.created_at, u.id
        limit 1
        on conflict (request_key) do nothing
        returning id, bike_unit_id`)

      if (rows.length > 0) {
        return { status: 'created', reservationId: rows[0].id, bikeUnitId: rows[0].bike_unit_id, replayed: false }
      }
      // No row: either nobody is free, or the same key won a race against this very call.
      const raced = await findByRequestKey(input.requestKey)
      if (raced) return { status: 'created', reservationId: raced.id, bikeUnitId: raced.bikeUnitId, replayed: true }
      return { status: 'no_bike_free' }
    } catch (error) {
      // Another request took the bike this one had picked, a moment earlier: pick again.
      if (pgErrorCode(error) === EXCLUSION_VIOLATION) continue
      throw error
    }
  }
  return { status: 'try_again' }
}

export type CancelResult = { status: 'cancelled' } | { status: 'not_found' }

export async function cancelReservation(id: string): Promise<CancelResult> {
  const rows = await db.update(bikeReservations)
    .set({ status: 'cancelled' })
    .where(and(eq(bikeReservations.id, id), eq(bikeReservations.status, 'confirmed')))
    .returning({ id: bikeReservations.id })
  return rows.length > 0 ? { status: 'cancelled' } : { status: 'not_found' }
}

export type MoveResult =
  | { status: 'moved' } | { status: 'conflict' } | { status: 'not_found' } | { status: 'unknown_bike' }

export async function moveReservation(id: string, bikeUnitId: string): Promise<MoveResult> {
  try {
    const rows = await db.update(bikeReservations)
      .set({ bikeUnitId })
      .where(and(
        eq(bikeReservations.id, id),
        eq(bikeReservations.kind, 'counter_rental'),
        eq(bikeReservations.status, 'confirmed'),
      ))
      .returning({ id: bikeReservations.id })
    return rows.length > 0 ? { status: 'moved' } : { status: 'not_found' }
  } catch (error) {
    const code = pgErrorCode(error)
    if (code === EXCLUSION_VIOLATION) return { status: 'conflict' }
    if (code === FOREIGN_KEY_VIOLATION) return { status: 'unknown_bike' }
    throw error
  }
}

export interface MoveCandidate {
  bikeUnitId: string
  shortId: string
  modelName: string
  sizeName: string
  versionName: string
  sameModelAndSize: boolean
}

/** Bikes free in the days of a reservation, those of the same model and size first. */
export async function getMoveCandidates(reservationId: string): Promise<MoveCandidate[]> {
  const [current] = await db.select({
    reservation: bikeReservations, modelId: bikeUnits.bikeModelId, sizeId: bikeUnits.bikeSizeId,
  })
    .from(bikeReservations)
    .innerJoin(bikeUnits, eq(bikeUnits.id, bikeReservations.bikeUnitId))
    .where(eq(bikeReservations.id, reservationId))
  if (!current) return []

  const { reservation } = current
  const rows = await db.execute<{
    id: string; model_name: string; size_name: string; version_name: string; is_same: boolean
  }>(sql`
    select u.id, coalesce(mt.name, 'Untitled') as model_name, s.name as size_name, v.name as version_name,
           (u.bike_model_id = ${current.modelId}::uuid and u.bike_size_id = ${current.sizeId}::uuid) as is_same
    from bike_units u
    join bike_sizes s on s.id = u.bike_size_id
    join bike_versions v on v.id = u.bike_version_id
    left join bike_model_translations mt on mt.bike_model_id = u.bike_model_id and mt.locale = 'it'
    where u.id <> ${reservation.bikeUnitId}::uuid
      and not exists (
        select 1 from bike_reservations r
        where r.bike_unit_id = u.id and r.status = 'confirmed'
          and r.during && daterange(${reservation.startsOn}::date, ${reservation.endsOn}::date, '[)'))
    order by is_same desc, model_name, s.display_order, v.display_order, u.id`)

  return rows.map((row) => ({
    bikeUnitId: row.id, shortId: row.id.slice(0, 8), modelName: row.model_name,
    sizeName: row.size_name, versionName: row.version_name, sameModelAndSize: row.is_same,
  }))
}

// ---------------------------------------------------------------------------------------------
// Maintenance

export interface PlanMaintenanceInput {
  requestKey: string
  bikeUnitId: string
  startsOn: IsoDate
  endsOn: IsoDate
  label: string | null
}

export type MaintenanceResult =
  | { status: 'planned'; reservationId: string; replayed: boolean }
  | { status: 'conflict'; conflicts: ReservationSummary[] }
  | { status: 'unknown_bike' }

export async function planMaintenance(input: PlanMaintenanceInput): Promise<MaintenanceResult> {
  try {
    const rows = await db.insert(bikeReservations)
      .values({
        bikeUnitId: input.bikeUnitId, kind: 'maintenance', status: 'confirmed',
        startsOn: input.startsOn, endsOn: input.endsOn, label: input.label, requestKey: input.requestKey,
      })
      .onConflictDoNothing({ target: bikeReservations.requestKey })
      .returning({ id: bikeReservations.id })
    if (rows.length > 0) return { status: 'planned', reservationId: rows[0].id, replayed: false }

    const replay = await findByRequestKey(input.requestKey)
    if (replay) return { status: 'planned', reservationId: replay.id, replayed: true }
    return { status: 'conflict', conflicts: [] }
  } catch (error) {
    const code = pgErrorCode(error)
    if (code === EXCLUSION_VIOLATION) {
      return { status: 'conflict', conflicts: await findOverlaps(input.bikeUnitId, input.startsOn, input.endsOn) }
    }
    if (code === FOREIGN_KEY_VIOLATION) return { status: 'unknown_bike' }
    throw error
  }
}

export type UpdateMaintenanceResult =
  | { status: 'updated' } | { status: 'conflict'; conflicts: ReservationSummary[] } | { status: 'not_found' }

export async function updateMaintenance(
  id: string, startsOn: IsoDate, endsOn: IsoDate,
): Promise<UpdateMaintenanceResult> {
  const [current] = await db.select().from(bikeReservations).where(and(
    eq(bikeReservations.id, id), eq(bikeReservations.kind, 'maintenance'), eq(bikeReservations.status, 'confirmed'),
  ))
  if (!current) return { status: 'not_found' }

  try {
    const rows = await db.update(bikeReservations)
      .set({ startsOn, endsOn })
      .where(and(
        eq(bikeReservations.id, id), eq(bikeReservations.kind, 'maintenance'), eq(bikeReservations.status, 'confirmed'),
      ))
      .returning({ id: bikeReservations.id })
    return rows.length > 0 ? { status: 'updated' } : { status: 'not_found' }
  } catch (error) {
    if (pgErrorCode(error) === EXCLUSION_VIOLATION) {
      return { status: 'conflict', conflicts: await findOverlaps(current.bikeUnitId, startsOn, endsOn, id) }
    }
    throw error
  }
}

/** Every confirmed range of a bike: what the maintenance picker must not let you cross. */
export async function getOccupiedRanges(bikeUnitId: string, excludeReservationId?: string): Promise<DayRange[]> {
  const rows = await db.select({ startsOn: bikeReservations.startsOn, endsOn: bikeReservations.endsOn })
    .from(bikeReservations)
    .where(and(
      eq(bikeReservations.bikeUnitId, bikeUnitId),
      eq(bikeReservations.status, 'confirmed'),
      excludeReservationId ? ne(bikeReservations.id, excludeReservationId) : undefined,
    ))
    .orderBy(asc(bikeReservations.startsOn))
  return rows
}

export interface MaintenanceInfo { startsOn: IsoDate; endsOn: IsoDate; active: boolean }

/** The maintenance in progress or the next one for each bike, for the Shop list. */
export async function getMaintenanceByUnit(today: IsoDate): Promise<Record<string, MaintenanceInfo>> {
  const rows = await db.select({
    unitId: bikeReservations.bikeUnitId, startsOn: bikeReservations.startsOn, endsOn: bikeReservations.endsOn,
  })
    .from(bikeReservations)
    .where(and(
      eq(bikeReservations.kind, 'maintenance'),
      eq(bikeReservations.status, 'confirmed'),
      gt(bikeReservations.endsOn, today),
    ))
    .orderBy(asc(bikeReservations.startsOn))

  const result: Record<string, MaintenanceInfo> = {}
  for (const row of rows) {
    if (row.unitId in result) continue
    result[row.unitId] = { startsOn: row.startsOn, endsOn: row.endsOn, active: daysBetween(row.startsOn, today) >= 0 }
  }
  return result
}

// ---------------------------------------------------------------------------------------------
// The calendar

export interface GridReservation {
  id: string
  kind: ReservationKind
  startsOn: IsoDate
  endsOn: IsoDate
  label: string | null
}

export interface GridUnit {
  id: string
  shortId: string
  modelName: string
  sizeName: string
  versionName: string
  reservations: GridReservation[]
}

/** Every bike with its confirmed reservations that touch the month. Two queries, no per-bike loop. */
export async function getGrid(month: IsoMonth): Promise<GridUnit[]> {
  const days = monthDays(month)
  const monthStart = days[0]
  const monthEnd = exclusiveEnd(days[days.length - 1])

  const [units, reservations] = await Promise.all([
    db.select({
      id: bikeUnits.id, modelName: bikeModelTranslations.name,
      sizeName: bikeSizes.name, versionName: bikeVersions.name,
    })
      .from(bikeUnits)
      .leftJoin(bikeModelTranslations, and(
        eq(bikeModelTranslations.bikeModelId, bikeUnits.bikeModelId), eq(bikeModelTranslations.locale, 'it'),
      ))
      .innerJoin(bikeSizes, eq(bikeSizes.id, bikeUnits.bikeSizeId))
      .innerJoin(bikeVersions, eq(bikeVersions.id, bikeUnits.bikeVersionId))
      .orderBy(
        asc(bikeModelTranslations.name), asc(bikeSizes.displayOrder), asc(bikeVersions.displayOrder),
        asc(bikeUnits.createdAt), asc(bikeUnits.id),
      ),
    db.select().from(bikeReservations).where(and(
      eq(bikeReservations.status, 'confirmed'),
      lt(bikeReservations.startsOn, monthEnd),
      gt(bikeReservations.endsOn, monthStart),
    )),
  ])

  const byUnit = new Map<string, GridReservation[]>()
  for (const row of reservations) {
    const list = byUnit.get(row.bikeUnitId) ?? []
    list.push({ id: row.id, kind: row.kind, startsOn: row.startsOn, endsOn: row.endsOn, label: row.label })
    byUnit.set(row.bikeUnitId, list)
  }

  return units.map((unit) => ({
    id: unit.id,
    shortId: unit.id.slice(0, 8),
    modelName: unit.modelName ?? 'Untitled',
    sizeName: unit.sizeName,
    versionName: unit.versionName,
    reservations: byUnit.get(unit.id) ?? [],
  }))
}

// ---------------------------------------------------------------------------------------------
// Removing a bike from the shop

export type DeleteBikeResult = { status: 'deleted' } | { status: 'has_reservations' }

/** A bike with any reservation, cancelled ones included, is not deleted: the history keeps pointing at it. */
export async function deleteBikeUnitUnlessReserved(id: string): Promise<DeleteBikeResult> {
  try {
    await db.delete(bikeUnits).where(eq(bikeUnits.id, id))
    return { status: 'deleted' }
  } catch (error) {
    if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) return { status: 'has_reservations' }
    throw error
  }
}
```

- [ ] **Step 4: Esegui le prove sul database**

Run: `npm run test:db`
Expected: PASS, tutte le prove di `constraint.test.ts` e `reservations.test.ts`.

Se «compares names without caring for case or accents» fallisce, controlla la collazione: su entrambi i database è `en_US.UTF-8` (verificato il 2026-10-02), dove `lower('ÉLODIE') = 'élodie'`.

- [ ] **Step 5: Verifica tipi, lint, suite unitaria**

Run: `npm run typecheck && npm run lint && npm test`
Expected: verde, compreso `lib/db/no-transactions.test.ts` (nessun `.transaction(` né `.begin(` nel nuovo codice).

- [ ] **Step 6: Commit**

```bash
git add lib/reservations.ts tests/db/reservations.test.ts
git commit -m "Add the reservations data layer: one statement per operation, retry on lost races, idempotent creation, duplicate warning"
```

### Fine della fase A

- [ ] **Apri la PR verso `staging`**

```bash
git push -u origin feat/booking-slice1-a
gh pr create --base staging --title "Booking slice 1, part A: dates, bike_reservations, data layer" --body "Task 1-3 del piano docs/superpowers/plans/2026-10-02-booking-slice1-admin-calendar.md. La migrazione 0010 è già applicata al database di sviluppo (che è quello di Preview)."
```

Poi **non aspettare i check**: passa alla fase B su un nuovo ramo solo dopo che questa PR è unita (una PR costruita sopra un'altra ancora aperta va in conflitto quando la prima entra con squash).

- [ ] **Dopo la prima PR verso `staging`**: aggiungi `CodeQL` ai check obbligatori di `staging` (la spec lo prevede: l'abbiamo lasciato fuori finché non lo vediamo girare qui). Controlla prima che `CodeQL` compaia tra i check della PR (`gh pr checks <n>`), poi:

```bash
cat > /tmp/staging-checks.json <<'EOF'
{ "strict": false, "contexts": ["verify", "browser", "CodeQL"] }
EOF
gh api -X PATCH repos/lelettricaleoni/lelettricaleoni.com/branches/staging/protection/required_status_checks --input /tmp/staging-checks.json
```

---

# Fase B — Azioni e tempo reale

(Ramo nuovo da `staging` aggiornato: `git fetch origin && git checkout -b feat/booking-slice1-b origin/staging`.)

## Task 4: Schemi `zod` e Server Action

**Files:**
- Create: `lib/reservation-schemas.ts`, `lib/reservation-schemas.test.ts`, `lib/actions/reservations.ts`, `lib/actions/reservations.test.ts`
- Modify: `lib/actions/bike-units.ts` (`deleteBikeUnitAction`)

**Interfaces:**
- Consumes: Task 1 (`buildRange`), Task 3 (tutte le funzioni e i tipi di risultato di `lib/reservations.ts`).
- Produces (usati da Task 7-9):

```ts
// lib/reservation-schemas.ts
createRentalSchema, planMaintenanceSchema, updateMaintenanceSchema, reservationIdSchema, moveReservationSchema, occupiedRangesSchema
type ActionInvalid = { status: 'invalid'; message: string }

// lib/actions/reservations.ts  ('use server')
createRentalAction(input: unknown): Promise<CreateRentalResult | ActionInvalid>
cancelReservationAction(input: unknown): Promise<CancelResult | ActionInvalid>
moveReservationAction(input: unknown): Promise<MoveResult | ActionInvalid>
getMoveCandidatesAction(input: unknown): Promise<MoveCandidate[]>
planMaintenanceAction(input: unknown): Promise<MaintenanceResult | ActionInvalid>
updateMaintenanceAction(input: unknown): Promise<UpdateMaintenanceResult | ActionInvalid>
getOccupiedRangesAction(input: unknown): Promise<DayRange[]>

// lib/actions/bike-units.ts
deleteBikeUnitAction(id: string): Promise<{ ok: true } | { ok: false; reason: 'has_reservations' }>
```

Input attesi: `createRentalAction({ requestKey, bikeModelId, bikeSizeId, bikeVersionId, firstDay, lastDay, label, confirmDuplicate? })`, `planMaintenanceAction({ requestKey, bikeUnitId, firstDay, lastDay, label? })`, `updateMaintenanceAction({ id, firstDay, lastDay })`, `cancelReservationAction({ id })`, `moveReservationAction({ id, bikeUnitId })`, `getMoveCandidatesAction({ id })`, `getOccupiedRangesAction({ bikeUnitId, excludeId? })`.

- [ ] **Step 1: Scrivi i test degli schemi** — `lib/reservation-schemas.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import {
  createRentalSchema, planMaintenanceSchema, updateMaintenanceSchema, moveReservationSchema, occupiedRangesSchema,
} from './reservation-schemas'

const id = () => crypto.randomUUID()
const rental = () => ({
  requestKey: id(), bikeModelId: id(), bikeSizeId: id(), bikeVersionId: id(),
  firstDay: '2026-07-10', lastDay: '2026-07-12', label: 'Rossi',
})

describe('createRentalSchema', () => {
  it('accepts a complete rental and defaults confirmDuplicate to false', () => {
    const parsed = createRentalSchema.parse(rental())
    expect(parsed.confirmDuplicate).toBe(false)
  })

  it('trims the name', () => {
    expect(createRentalSchema.parse({ ...rental(), label: '  Élodie  ' }).label).toBe('Élodie')
  })

  it('rejects an empty name and a name of only spaces', () => {
    expect(createRentalSchema.safeParse({ ...rental(), label: '' }).success).toBe(false)
    expect(createRentalSchema.safeParse({ ...rental(), label: '    ' }).success).toBe(false)
  })

  it('rejects a name longer than 120 characters', () => {
    expect(createRentalSchema.safeParse({ ...rental(), label: 'a'.repeat(121) }).success).toBe(false)
  })

  it('keeps accents and symbols in a name', () => {
    expect(createRentalSchema.parse({ ...rental(), label: 'Müller & Söhne 🚲' }).label).toBe('Müller & Söhne 🚲')
  })

  it('rejects impossible days and ids that are not uuids', () => {
    expect(createRentalSchema.safeParse({ ...rental(), firstDay: '2026-02-30' }).success).toBe(false)
    expect(createRentalSchema.safeParse({ ...rental(), lastDay: '10/07/2026' }).success).toBe(false)
    expect(createRentalSchema.safeParse({ ...rental(), requestKey: 'not-a-uuid' }).success).toBe(false)
  })

  it('says what is wrong with the name', () => {
    const result = createRentalSchema.safeParse({ ...rental(), label: ' ' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].message).toBe('Name is required')
  })
})

describe('the other schemas', () => {
  it('accepts a maintenance without a reason, and with one', () => {
    const base = { requestKey: id(), bikeUnitId: id(), firstDay: '2026-07-10', lastDay: '2026-07-12' }
    expect(planMaintenanceSchema.safeParse(base).success).toBe(true)
    expect(planMaintenanceSchema.safeParse({ ...base, label: 'chain' }).success).toBe(true)
  })

  it('needs ids and days for an update, a move and the occupied ranges', () => {
    expect(updateMaintenanceSchema.safeParse({ id: id(), firstDay: '2026-07-10', lastDay: '2026-07-12' }).success).toBe(true)
    expect(moveReservationSchema.safeParse({ id: id(), bikeUnitId: id() }).success).toBe(true)
    expect(moveReservationSchema.safeParse({ id: id() }).success).toBe(false)
    expect(occupiedRangesSchema.safeParse({ bikeUnitId: id() }).success).toBe(true)
  })
})
```

- [ ] **Step 2: Esegui e verifica che fallisca**

Run: `npx vitest run lib/reservation-schemas.test.ts`
Expected: FAIL, import non risolto.

- [ ] **Step 3: Implementa gli schemi** — `lib/reservation-schemas.ts`

```ts
import { z } from 'zod'

// No regex anywhere: zod validates days, ids and the rest.
const day = z.iso.date()
const id = z.uuid()

// Kept out of lib/actions/reservations.ts: a 'use server' file may only export async functions.
export type ActionInvalid = { status: 'invalid'; message: string }

export const createRentalSchema = z.object({
  requestKey: id,
  bikeModelId: id,
  bikeSizeId: id,
  bikeVersionId: id,
  firstDay: day,
  lastDay: day,
  label: z.string().trim().min(1, 'Name is required').max(120, 'Name is too long'),
  confirmDuplicate: z.boolean().default(false),
})

export const planMaintenanceSchema = z.object({
  requestKey: id,
  bikeUnitId: id,
  firstDay: day,
  lastDay: day,
  label: z.string().trim().max(120, 'Reason is too long').optional(),
})

export const updateMaintenanceSchema = z.object({ id, firstDay: day, lastDay: day })
export const reservationIdSchema = z.object({ id })
export const moveReservationSchema = z.object({ id, bikeUnitId: id })
export const occupiedRangesSchema = z.object({ bikeUnitId: id, excludeId: id.optional() })
```

- [ ] **Step 4: Esegui e verifica che passi**

Run: `npx vitest run lib/reservation-schemas.test.ts`
Expected: PASS. Se «rejects impossible days» fallisce perché `z.iso.date()` accetta `2026-02-30`, aggiungi `.refine(isValidDay, 'That is not a valid date')` importando `isValidDay` da `@/lib/dates` e riesegui.

- [ ] **Step 5: Scrivi il test delle azioni, con il livello dati sostituito** — `lib/actions/reservations.test.ts`

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ getAdminUser: vi.fn() }))
vi.mock('@/lib/reservations', () => ({
  createCounterRental: vi.fn(),
  cancelReservation: vi.fn(),
  moveReservation: vi.fn(),
  getMoveCandidates: vi.fn(),
  planMaintenance: vi.fn(),
  updateMaintenance: vi.fn(),
  getOccupiedRanges: vi.fn(),
}))

import { getAdminUser } from '@/lib/supabase/server'
import * as reservations from '@/lib/reservations'
import { createRentalAction, planMaintenanceAction, updateMaintenanceAction } from './reservations'

const id = () => crypto.randomUUID()
const rentalInput = () => ({
  requestKey: id(), bikeModelId: id(), bikeSizeId: id(), bikeVersionId: id(),
  firstDay: '2026-07-10', lastDay: '2026-07-12', label: 'Rossi',
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getAdminUser).mockResolvedValue({ id: 'admin' } as never)
})

describe('createRentalAction', () => {
  it('refuses anyone who is not an admin', async () => {
    vi.mocked(getAdminUser).mockResolvedValue(null as never)
    await expect(createRentalAction(rentalInput())).rejects.toThrow('Unauthorized')
    expect(reservations.createCounterRental).not.toHaveBeenCalled()
  })

  it('answers invalid for bad input, without touching the database', async () => {
    const result = await createRentalAction({ ...rentalInput(), requestKey: 'nope' })
    expect(result.status).toBe('invalid')
    expect(reservations.createCounterRental).not.toHaveBeenCalled()
  })

  it('answers invalid when the last day is before the first', async () => {
    const result = await createRentalAction({ ...rentalInput(), firstDay: '2026-07-12', lastDay: '2026-07-10' })
    expect(result).toEqual({ status: 'invalid', message: 'The last day cannot be before the first day' })
  })

  it('passes the stored range to the data layer: the end is exclusive', async () => {
    vi.mocked(reservations.createCounterRental).mockResolvedValue({ status: 'no_bike_free' })
    await createRentalAction(rentalInput())
    expect(reservations.createCounterRental).toHaveBeenCalledWith(
      expect.objectContaining({ startsOn: '2026-07-10', endsOn: '2026-07-13', label: 'Rossi', confirmDuplicate: false }),
    )
  })

  it('returns what the data layer says', async () => {
    vi.mocked(reservations.createCounterRental).mockResolvedValue({ status: 'no_bike_free' })
    expect(await createRentalAction(rentalInput())).toEqual({ status: 'no_bike_free' })
  })
})

describe('maintenance actions', () => {
  it('turns the last day included into the exclusive end, and an empty reason into null', async () => {
    vi.mocked(reservations.planMaintenance).mockResolvedValue({ status: 'planned', reservationId: id(), replayed: false })
    await planMaintenanceAction({ requestKey: id(), bikeUnitId: id(), firstDay: '2026-07-10', lastDay: '2026-07-10' })
    expect(reservations.planMaintenance).toHaveBeenCalledWith(
      expect.objectContaining({ startsOn: '2026-07-10', endsOn: '2026-07-11', label: null }),
    )
  })

  it('rejects a reversed range on update', async () => {
    const result = await updateMaintenanceAction({ id: id(), firstDay: '2026-07-12', lastDay: '2026-07-10' })
    expect(result.status).toBe('invalid')
    expect(reservations.updateMaintenance).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Esegui e verifica che fallisca**

Run: `npx vitest run lib/actions/reservations.test.ts`
Expected: FAIL, import `./reservations` non risolto.

- [ ] **Step 7: Implementa le azioni** — `lib/actions/reservations.ts`

```ts
'use server'
import { getAdminUser } from '@/lib/supabase/server'
import { buildRange, type DayRange } from '@/lib/dates'
import {
  createRentalSchema, moveReservationSchema, occupiedRangesSchema, planMaintenanceSchema,
  reservationIdSchema, updateMaintenanceSchema, type ActionInvalid,
} from '@/lib/reservation-schemas'
import * as reservations from '@/lib/reservations'

async function requireAdmin() {
  const user = await getAdminUser()
  if (!user) throw new Error('Unauthorized')
}

function invalid(message: string): ActionInvalid {
  return { status: 'invalid', message }
}

const RANGE_MESSAGES = {
  invalid_day: 'That is not a valid date',
  end_before_start: 'The last day cannot be before the first day',
} as const

export async function createRentalAction(input: unknown): Promise<reservations.CreateRentalResult | ActionInvalid> {
  await requireAdmin()
  const parsed = createRentalSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? 'Invalid input')
  const range = buildRange(parsed.data.firstDay, parsed.data.lastDay)
  if (!range.ok) return invalid(RANGE_MESSAGES[range.reason])

  return reservations.createCounterRental({
    requestKey: parsed.data.requestKey,
    bikeModelId: parsed.data.bikeModelId,
    bikeSizeId: parsed.data.bikeSizeId,
    bikeVersionId: parsed.data.bikeVersionId,
    startsOn: range.startsOn,
    endsOn: range.endsOn,
    label: parsed.data.label,
    confirmDuplicate: parsed.data.confirmDuplicate,
  })
}

export async function cancelReservationAction(input: unknown): Promise<reservations.CancelResult | ActionInvalid> {
  await requireAdmin()
  const parsed = reservationIdSchema.safeParse(input)
  if (!parsed.success) return invalid('Invalid reservation')
  return reservations.cancelReservation(parsed.data.id)
}

export async function moveReservationAction(input: unknown): Promise<reservations.MoveResult | ActionInvalid> {
  await requireAdmin()
  const parsed = moveReservationSchema.safeParse(input)
  if (!parsed.success) return invalid('Invalid bike')
  return reservations.moveReservation(parsed.data.id, parsed.data.bikeUnitId)
}

export async function getMoveCandidatesAction(input: unknown): Promise<reservations.MoveCandidate[]> {
  await requireAdmin()
  const parsed = reservationIdSchema.safeParse(input)
  return parsed.success ? reservations.getMoveCandidates(parsed.data.id) : []
}

export async function planMaintenanceAction(input: unknown): Promise<reservations.MaintenanceResult | ActionInvalid> {
  await requireAdmin()
  const parsed = planMaintenanceSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? 'Invalid input')
  const range = buildRange(parsed.data.firstDay, parsed.data.lastDay)
  if (!range.ok) return invalid(RANGE_MESSAGES[range.reason])

  return reservations.planMaintenance({
    requestKey: parsed.data.requestKey,
    bikeUnitId: parsed.data.bikeUnitId,
    startsOn: range.startsOn,
    endsOn: range.endsOn,
    label: parsed.data.label ? parsed.data.label : null,
  })
}

export async function updateMaintenanceAction(input: unknown): Promise<reservations.UpdateMaintenanceResult | ActionInvalid> {
  await requireAdmin()
  const parsed = updateMaintenanceSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? 'Invalid input')
  const range = buildRange(parsed.data.firstDay, parsed.data.lastDay)
  if (!range.ok) return invalid(RANGE_MESSAGES[range.reason])

  return reservations.updateMaintenance(parsed.data.id, range.startsOn, range.endsOn)
}

export async function getOccupiedRangesAction(input: unknown): Promise<DayRange[]> {
  await requireAdmin()
  const parsed = occupiedRangesSchema.safeParse(input)
  return parsed.success ? reservations.getOccupiedRanges(parsed.data.bikeUnitId, parsed.data.excludeId) : []
}
```

- [ ] **Step 8: Esegui e verifica che passi**

Run: `npx vitest run lib/actions/reservations.test.ts lib/reservation-schemas.test.ts`
Expected: PASS.

- [ ] **Step 9: `deleteBikeUnitAction` risponde invece di lanciare** — `lib/actions/bike-units.ts`

Aggiungi all'import in cima: `import { deleteBikeUnitUnlessReserved } from '@/lib/reservations'`. Sostituisci la funzione:

```ts
export async function deleteBikeUnitAction(id: string): Promise<{ ok: true } | { ok: false; reason: 'has_reservations' }> {
  await requireAdmin()
  const result = await deleteBikeUnitUnlessReserved(id)
  if (result.status === 'has_reservations') return { ok: false, reason: 'has_reservations' }
  updateTag('bike-units')
  return { ok: true }
}
```

- [ ] **Step 10: Verifica tipi, lint, suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: verde. `typecheck` segnala `components/admin/bike-unit-list.tsx` solo se ignora il nuovo ritorno: il Task 9 lo adegua; qui il valore di ritorno non usato non è un errore di tipo.

- [ ] **Step 11: Commit**

```bash
git add lib/reservation-schemas.ts lib/reservation-schemas.test.ts lib/actions
git commit -m "Add the reservation Server Actions and their zod schemas; deleting a reserved bike answers instead of throwing"
```

---

## Task 5: Il campanello in tempo reale

**Files:**
- Create (generato, poi riempito a mano): `lib/db/migrations/0011_reservation_realtime.sql`
- Create: `tests/db/realtime.test.ts`, `components/admin/use-reservations-realtime.ts`

**Interfaces:**
- Consumes: Task 2 (tabella e fixture), `createSupabaseBrowserClient()` da `lib/supabase/client.ts`.
- Produces: `useReservationsRealtime(onChange: () => void): void` — chiama `onChange` quando arriva un campanello, alla riconnessione e quando la scheda torna visibile. Canale pubblico `reservations`, evento `changed`, payload `{ op, bike_unit_id, previous_bike_unit_id, starts_on, ends_on }`.

- [ ] **Step 1: Scrivi le prove sul database** — `tests/db/realtime.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { createClient } from '@supabase/supabase-js'
import { db, bikeReservations } from '@/lib/db'
import { createFixture, reservationValues, type Fixture } from './fixtures'

describe('the reservations ping', () => {
  let fx: Fixture
  beforeEach(async () => { fx = await createFixture(1) })
  afterEach(async () => { await fx.cleanup() })

  it('sends a ping with the bike and the days, and no name, when a reservation is created', async () => {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const insert = () => db.insert(bikeReservations).values(
      reservationValues(fx.unitIds[0], '2031-07-10', '2031-07-13', { label: 'Mario Rossi segreto' }),
    )
    try {
      const payload = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('no ping within 15 s')), 15_000)
        supabase.channel('reservations')
          .on('broadcast', { event: 'changed' }, (message) => { clearTimeout(timer); resolve(message.payload) })
          .subscribe((status) => { if (status === 'SUBSCRIBED') void insert() })
      })
      expect(Object.keys(payload).sort()).toEqual(['bike_unit_id', 'ends_on', 'op', 'previous_bike_unit_id', 'starts_on'])
      expect(payload.op).toBe('INSERT')
      expect(payload.bike_unit_id).toBe(fx.unitIds[0])
      expect(JSON.stringify(payload)).not.toContain('Rossi')
    } finally {
      await supabase.removeAllChannels()
    }
  })

  it('has a trigger function that never touches the label and cannot be called through the API', async () => {
    const [{ definition }] = await db.execute<{ definition: string }>(sql`
      select pg_get_functiondef('public.notify_reservation_change()'::regprocedure) as definition`)
    expect(definition).not.toContain('label')

    const [{ anon, authenticated }] = await db.execute<{ anon: boolean; authenticated: boolean }>(sql`
      select has_function_privilege('anon', 'public.notify_reservation_change()', 'execute') as anon,
             has_function_privilege('authenticated', 'public.notify_reservation_change()', 'execute') as authenticated`)
    expect(anon).toBe(false)
    expect(authenticated).toBe(false)
  })
})
```

- [ ] **Step 2: Esegui e verifica che fallisca**

Run: `npm run test:db -- tests/db/realtime.test.ts`
Expected: FAIL (scadenza di 15 s e funzione inesistente).

- [ ] **Step 3: Genera e riempi la migrazione**

Run: `npx drizzle-kit generate --custom --name=reservation_realtime`
Expected: crea `lib/db/migrations/0011_reservation_realtime.sql` vuoto. Scrivici:

```sql
-- A bare ping, never data: a public Realtime channel can be listened to by anyone, so the
-- payload has the bike and the days and nothing personal (no label). Clients refetch.
-- Sent from the database, not from the app, so ANY write notifies: an action, a payment,
-- the worker, a manual fix.
CREATE OR REPLACE FUNCTION public.notify_reservation_change() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  PERFORM realtime.send(
    jsonb_build_object(
      'op', TG_OP,
      'bike_unit_id', NEW.bike_unit_id,
      'previous_bike_unit_id', CASE WHEN TG_OP = 'UPDATE' THEN OLD.bike_unit_id ELSE NULL END,
      'starts_on', NEW.starts_on,
      'ends_on', NEW.ends_on
    ),
    'changed',
    'reservations',
    false
  );
  RETURN NEW;
END;
$$;
--> statement-breakpoint
-- A trigger function is not meant to be called through /rest/v1/rpc: nobody gets EXECUTE.
REVOKE ALL ON FUNCTION public.notify_reservation_change() FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
CREATE TRIGGER bike_reservations_notify
AFTER INSERT OR UPDATE ON public.bike_reservations
FOR EACH ROW EXECUTE FUNCTION public.notify_reservation_change();
```

- [ ] **Step 4: Applica e riesegui le prove**

Run: `npm run db:migrate && npm run test:db -- tests/db/realtime.test.ts`
Expected: PASS (2 test). Se il primo scade (15 s) con la funzione presente, apri la dashboard del progetto di sviluppo → Realtime → Settings e verifica che **«Allow public access»** sia attivo: senza, i canali pubblici non si possono ascoltare. Se `realtime.send` risponde con un errore di permessi, la funzione va resa `SECURITY DEFINER` con `SET search_path = ''` e il `REVOKE` del Step 3 resta invariato.

- [ ] **Step 5: Scrivi l'hook** — `components/admin/use-reservations-realtime.ts`

```ts
'use client'
import { useEffect, useRef } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

/**
 * Calls `onChange` when a reservation changes anywhere, when the connection comes back after a
 * drop, and when the tab becomes visible again. The ping carries no data worth trusting: the
 * caller just reloads what it shows.
 */
export function useReservationsRealtime(onChange: () => void) {
  const latest = useRef(onChange)
  useEffect(() => { latest.current = onChange })

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    let connectedBefore = false

    const channel = supabase
      .channel('reservations')
      .on('broadcast', { event: 'changed' }, () => latest.current())
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return
        // The first connection is the initial page load: nothing to reload.
        if (connectedBefore) latest.current()
        connectedBefore = true
      })

    const onVisible = () => { if (document.visibilityState === 'visible') latest.current() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      void supabase.removeChannel(channel)
    }
  }, [])
}
```

- [ ] **Step 6: Verifica tipi, lint, suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: verde.

- [ ] **Step 7: Commit**

```bash
git add lib/db/migrations tests/db/realtime.test.ts components/admin/use-reservations-realtime.ts
git commit -m "Add the reservations ping: a trigger broadcasts the bike and the days, never a name; a hook listens"
```

### Fine della fase B

- [ ] **Apri la PR verso `staging`**

```bash
git push -u origin feat/booking-slice1-b
gh pr create --base staging --title "Booking slice 1, part B: Server Actions and the real-time ping" --body "Task 4-5 del piano. La migrazione 0011 è già applicata al database di sviluppo."
```

---

# Fase C — Il pannello

(Ramo nuovo da `staging` aggiornato dopo l'unione della fase B: `git checkout -b feat/booking-slice1-c origin/staging`.)

## Task 6: La pagina `/manage/bookings` e la griglia

**Files:**
- Create: `lib/booking-grid.ts`, `lib/booking-grid.test.ts`, `app/manage/bookings/page.tsx`, `components/admin/booking-types.ts`, `components/admin/booking-view.tsx`
- Modify: `components/admin/admin-sidebar.tsx`

**Interfaces:**
- Consumes: Task 1 (date), Task 3 (`getGrid`, `GridUnit`, `GridReservation`), Task 5 (`useReservationsRealtime`), `getPublishedModelsWithAllowedOptions()` da `lib/actions/bike-units.ts`.
- Produces:
  - `lib/booking-grid.ts`: `interface GridBlock { reservationId: string; kind: ReservationKind; label: string | null; startColumn: number; span: number; clippedStart: boolean; clippedEnd: boolean }`, `layoutBlocks(month: IsoMonth, reservations: GridReservation[]): GridBlock[]`, `occupiedDayRanges(ranges: DayRange[]): { from: Date; to: Date }[]`.
  - `components/admin/booking-types.ts`: `type ModelOption`.
  - `components/admin/booking-view.tsx`: `BookingView({ month, today, units })`. I Task 7 e 8 la sostituiscono con una versione completa che aggiunge `models`, i moduli e le finestre.

- [ ] **Step 1: Scrivi i test della disposizione** — `lib/booking-grid.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { layoutBlocks, occupiedDayRanges } from './booking-grid'

const res = (startsOn: string, endsOn: string, id = 'r1') => ({
  id, kind: 'counter_rental' as const, startsOn, endsOn, label: 'Rossi',
})

describe('layoutBlocks', () => {
  it('places a reservation inside the month on its columns', () => {
    expect(layoutBlocks('2031-07', [res('2031-07-10', '2031-07-13')])).toEqual([
      { reservationId: 'r1', kind: 'counter_rental', label: 'Rossi', startColumn: 10, span: 3, clippedStart: false, clippedEnd: false },
    ])
  })

  it('clips one that started in the previous month', () => {
    const [block] = layoutBlocks('2031-07', [res('2031-06-28', '2031-07-03')])
    expect(block).toMatchObject({ startColumn: 1, span: 2, clippedStart: true, clippedEnd: false })
  })

  it('clips one that ends in the next month', () => {
    const [block] = layoutBlocks('2031-07', [res('2031-07-30', '2031-08-04')])
    expect(block).toMatchObject({ startColumn: 30, span: 2, clippedStart: false, clippedEnd: true })
  })

  it('covers the whole month when it starts before and ends after', () => {
    const [block] = layoutBlocks('2031-07', [res('2031-06-20', '2031-08-10')])
    expect(block).toMatchObject({ startColumn: 1, span: 31, clippedStart: true, clippedEnd: true })
  })

  it('reaches the last day of a 31-day month exactly, without clipping', () => {
    const [block] = layoutBlocks('2031-07', [res('2031-07-29', '2031-08-01')])
    expect(block).toMatchObject({ startColumn: 29, span: 3, clippedEnd: false })
  })

  it('counts the right number of columns in February, leap year included', () => {
    expect(layoutBlocks('2031-02', [res('2031-02-27', '2031-03-05')])[0]).toMatchObject({ startColumn: 27, span: 2, clippedEnd: true })
    expect(layoutBlocks('2028-02', [res('2028-02-27', '2028-03-05')])[0]).toMatchObject({ startColumn: 27, span: 3, clippedEnd: true })
  })

  it('leaves out a reservation that ends the day the month starts, or starts the day it ends', () => {
    expect(layoutBlocks('2031-07', [res('2031-06-28', '2031-07-01')])).toEqual([])
    expect(layoutBlocks('2031-07', [res('2031-08-01', '2031-08-03')])).toEqual([])
  })

  it('keeps every reservation it is given, in order', () => {
    const blocks = layoutBlocks('2031-07', [res('2031-07-01', '2031-07-03', 'a'), res('2031-07-03', '2031-07-05', 'b')])
    expect(blocks.map((b) => b.reservationId)).toEqual(['a', 'b'])
  })
})

describe('occupiedDayRanges', () => {
  it('turns stored ranges into the days the picker must disable, last day included', () => {
    const [range] = occupiedDayRanges([{ startsOn: '2031-07-10', endsOn: '2031-07-13' }])
    expect(range.from.getDate()).toBe(10)
    expect(range.to.getDate()).toBe(12)
  })
})
```

- [ ] **Step 2: Esegui e verifica che fallisca**

Run: `npx vitest run lib/booking-grid.test.ts`
Expected: FAIL, import non risolto.

- [ ] **Step 3: Implementa** — `lib/booking-grid.ts`

```ts
import { dayToDate, daysBetween, inclusiveEnd, monthDays, type DayRange, type IsoMonth } from '@/lib/dates'
import type { GridReservation, ReservationKind } from '@/lib/reservations'

export interface GridBlock {
  reservationId: string
  kind: ReservationKind
  label: string | null
  /** 1-based column of the first visible day (the label column is not counted). */
  startColumn: number
  /** Number of visible days. */
  span: number
  clippedStart: boolean
  clippedEnd: boolean
}

/**
 * Where each reservation sits in a month: clipped to the month, so one that starts before it or
 * ends after it still shows, and one that only touches the edge (ends the day the month starts,
 * starts the day it ends) does not.
 */
export function layoutBlocks(month: IsoMonth, reservations: GridReservation[]): GridBlock[] {
  const days = monthDays(month)
  const first = days[0]
  const blocks: GridBlock[] = []

  for (const reservation of reservations) {
    const startOffset = daysBetween(first, reservation.startsOn)
    const endOffset = daysBetween(first, reservation.endsOn)
    const startIndex = Math.max(0, startOffset)
    const endIndex = Math.min(days.length, endOffset)
    const span = endIndex - startIndex
    if (span <= 0) continue

    blocks.push({
      reservationId: reservation.id,
      kind: reservation.kind,
      label: reservation.label,
      startColumn: startIndex + 1,
      span,
      clippedStart: startOffset < 0,
      clippedEnd: endOffset > days.length,
    })
  }
  return blocks
}

/**
 * The days of a bike that are taken, in the shape the calendar widget wants for `disabled`
 * ({ from, to }, both included). Dates only here, at the edge with the widget.
 */
export function occupiedDayRanges(ranges: DayRange[]): { from: Date; to: Date }[] {
  return ranges.map((range) => ({ from: dayToDate(range.startsOn), to: dayToDate(inclusiveEnd(range.endsOn)) }))
}
```

- [ ] **Step 4: Esegui e verifica che passi**

Run: `npx vitest run lib/booking-grid.test.ts`
Expected: PASS.

- [ ] **Step 5: La voce nella sidebar** — `components/admin/admin-sidebar.tsx`

Nell'import di `lucide-react` aggiungi `CalendarDays`:

```ts
import { Home, Map, Users, Code2, LogOut, Bike, SlidersHorizontal, Warehouse, CalendarDays } from 'lucide-react'
```

Nel gruppo `Bikes` aggiungi una voce dopo `Shop`:

```ts
  { label: 'Bikes', items: [
    { href: '/manage/bikes', label: 'Bikes', icon: Bike },
    { href: '/manage/bikes/shop', label: 'Shop', icon: Warehouse },
    { href: '/manage/bookings', label: 'Bookings', icon: CalendarDays },
    { href: '/manage/bike-options', label: 'Bike options', icon: SlidersHorizontal },
  ] },
```

- [ ] **Step 6: La pagina** — `app/manage/bookings/page.tsx`

```tsx
import { redirect } from 'next/navigation'
import { getAdminUser } from '@/lib/supabase/server'
import { getGrid } from '@/lib/reservations'
import { currentMonthInRome, parseMonth, todayInRome } from '@/lib/dates'
import { BookingView } from '@/components/admin/booking-view'

// Read live: the calendar must be exact, not "within 10-30 seconds" like the cached catalogues.
export const instant = false

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await getAdminUser()
  if (!user) redirect('/manage/login')

  const { month: monthParam } = await searchParams
  const month = parseMonth(monthParam) ?? currentMonthInRome()

  return <BookingView month={month} today={todayInRome()} units={await getGrid(month)} />
}
```

- [ ] **Step 7: Il tipo condiviso e la vista**

`components/admin/booking-types.ts`:

```ts
import type { getPublishedModelsWithAllowedOptions } from '@/lib/actions/bike-units'

/** A published model with the sizes and versions it allows, as the Shop and the rental form need it. */
export type ModelOption = Awaited<ReturnType<typeof getPublishedModelsWithAllowedOptions>>[number]
```

`components/admin/booking-view.tsx` (versione del Task 6: solo la griglia):

```tsx
'use client'
import { Fragment, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { layoutBlocks } from '@/lib/booking-grid'
import {
  dayOfMonth, isWeekendDay, monthDays, monthTitle, shiftMonth, weekdayLetter, type IsoDate, type IsoMonth,
} from '@/lib/dates'
import type { GridUnit } from '@/lib/reservations'
import { useReservationsRealtime } from '@/components/admin/use-reservations-realtime'

interface BookingViewProps {
  month: IsoMonth
  today: IsoDate
  units: GridUnit[]
}

const LABEL_COLUMN = 'minmax(11rem, 14rem)'

export function BookingView({ month, today, units }: BookingViewProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const days = monthDays(month)

  // router.refresh() re-runs this page's server component: the ping carries nothing to trust,
  // so the grid is simply read again.
  useReservationsRealtime(() => startTransition(() => router.refresh()))

  const columns = `${LABEL_COLUMN} repeat(${days.length}, minmax(2rem, 1fr))`

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[#1e3a5f]">Bookings</h1>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="icon" aria-label="Previous month">
            <Link href={`/manage/bookings?month=${shiftMonth(month, -1)}`}><ChevronLeft size={16} /></Link>
          </Button>
          <span className="min-w-36 text-center font-medium">{monthTitle(month)}</span>
          <Button asChild variant="outline" size="icon" aria-label="Next month">
            <Link href={`/manage/bookings?month=${shiftMonth(month, 1)}`}><ChevronRight size={16} /></Link>
          </Button>
        </div>
      </div>

      <Legend />

      {units.length === 0 ? (
        <p className="text-sm text-muted-foreground">No bikes in the shop yet. Add them in Shop first.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <div className="grid min-w-max" style={{ gridTemplateColumns: columns }}>
            <div className="sticky left-0 z-10 border-b bg-card p-2 text-xs font-medium text-muted-foreground">Bike</div>
            {days.map((day) => (
              <div
                key={day}
                className={cn(
                  'border-b border-l p-1 text-center text-[10px] leading-tight text-muted-foreground',
                  isWeekendDay(day) && 'bg-muted/50',
                  day === today && 'bg-[#366DA1]/15 font-semibold text-foreground',
                )}
              >
                <div>{weekdayLetter(day)}</div>
                <div className="text-xs">{dayOfMonth(day)}</div>
              </div>
            ))}

            {units.map((unit, index) => (
              <Fragment key={unit.id}>
                {(index === 0 || units[index - 1].modelName !== unit.modelName) && (
                  <div className="col-span-full border-b bg-muted/40 px-2 py-1 text-xs font-semibold text-[#1e3a5f]">
                    {unit.modelName}
                  </div>
                )}
                <UnitRow unit={unit} month={month} days={days} today={today} />
              </Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5"><span className="inline-block size-3 rounded-sm bg-[#366DA1]" />Rental</span>
      <span className="flex items-center gap-1.5"><span className="inline-block size-3 rounded-sm bg-amber-300" />Maintenance</span>
    </div>
  )
}

function UnitRow({ unit, month, days, today }: { unit: GridUnit; month: IsoMonth; days: IsoDate[]; today: IsoDate }) {
  const blocks = layoutBlocks(month, unit.reservations)

  return (
    <>
      <div className="sticky left-0 z-10 flex flex-col justify-center border-b bg-card px-2 py-1">
        <span className="font-mono text-[10px] text-muted-foreground">{unit.shortId}</span>
        <span className="text-xs">{unit.sizeName} · {unit.versionName}</span>
      </div>
      <div
        className="relative grid min-h-10 border-b"
        style={{ gridColumn: `2 / span ${days.length}`, gridTemplateColumns: `repeat(${days.length}, minmax(2rem, 1fr))` }}
      >
        {days.map((day, i) => (
          <div
            key={day}
            className={cn('border-l', isWeekendDay(day) && 'bg-muted/50', day === today && 'bg-[#366DA1]/10')}
            style={{ gridColumn: i + 1, gridRow: 1 }}
          />
        ))}
        {blocks.map((block) => (
          <div
            key={block.reservationId}
            title={block.label ?? undefined}
            className={cn(
              'z-[1] my-1 truncate px-1.5 text-xs leading-7',
              block.kind === 'maintenance' ? 'bg-amber-300 text-amber-950' : 'bg-[#366DA1] text-white',
              block.clippedStart ? 'rounded-l-none' : 'rounded-l-md',
              block.clippedEnd ? 'rounded-r-none' : 'rounded-r-md',
            )}
            style={{ gridColumn: `${block.startColumn} / span ${block.span}`, gridRow: 1 }}
          >
            {block.label ?? (block.kind === 'maintenance' ? 'Maintenance' : '')}
          </div>
        ))}
      </div>
    </>
  )
}
```

- [ ] **Step 8: Verifica tipi, lint, suite e a vista**

Run: `npm run typecheck && npm run lint && npm test`
Expected: verde.

Poi `npm run dev`, accedi a `/manage/login`, apri `http://localhost:3000/manage/bookings`.
Expected: la griglia del mese corrente, le bici del negozio raggruppate per modello, il giorno di oggi evidenziato, le frecce che cambiano mese (`?month=`), nessun errore in console. Con il database di sviluppo vuoto di prenotazioni le righe sono vuote.

- [ ] **Step 9: Commit**

```bash
git add lib/booking-grid.ts lib/booking-grid.test.ts app/manage/bookings components/admin/booking-types.ts components/admin/booking-view.tsx components/admin/admin-sidebar.tsx
git commit -m "Add /manage/bookings: the bikes by days grid, month navigation, live reload on a ping"
```

---

## Task 7: Il calendario di shadcn e il modulo «nuovo noleggio»

**Files:**
- Create (generato): `components/ui/calendar.tsx`
- Create: `components/admin/rental-form.tsx`
- Modify (sostituiti per intero): `app/manage/bookings/page.tsx`, `components/admin/booking-view.tsx`

**Interfaces:**
- Consumes: Task 4 (`createRentalAction`), Task 1 (`isoDay`, `inclusiveEnd`), tipo `ModelOption` da `booking-types.ts` (Task 6).
- Produces: `RentalForm({ models, onCreated }: { models: ModelOption[]; onCreated: () => void })`; `components/ui/calendar.tsx` con `Calendar` (usato anche nel Task 8).

- [ ] **Step 1: Aggiungi il componente calendario di shadcn**

Run: `npx shadcn@latest add calendar --yes`
Expected: crea `components/ui/calendar.tsx` e aggiunge `react-day-picker` a `package.json`.

Run: `npm run typecheck`
Expected: verde. Se la versione installata di `react-day-picker` non coincide con quella per cui il file generato è scritto (errori su `classNames`, `components`), apri `components/ui/calendar.tsx`, guarda da quale versione importa e fissa quella in `package.json` (`npm install react-day-picker@<versione>`), poi riesegui il typecheck. Verifica anche che l'interfaccia accetti `mode="range"`, `selected`, `onSelect`, `disabled` ed `excludeDisabled` (le props sono quelle della libreria, già confermate nel pacchetto 10.0.2).

- [ ] **Step 2: Il modulo** — `components/admin/rental-form.tsx`

```tsx
'use client'
import { useState, useTransition } from 'react'
import type { DateRange } from 'react-day-picker'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { createRentalAction } from '@/lib/actions/reservations'
import { inclusiveEnd, isoDay } from '@/lib/dates'
import type { ReservationSummary } from '@/lib/reservations'
import type { ModelOption } from '@/components/admin/booking-types'

export function RentalForm({ models, onCreated }: { models: ModelOption[]; onCreated: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [modelId, setModelId] = useState('')
  const [sizeId, setSizeId] = useState('')
  const [versionId, setVersionId] = useState('')
  const [range, setRange] = useState<DateRange | undefined>()
  const [label, setLabel] = useState('')
  // One key per form opening: a repeated submit (double click, network retry, back and resend)
  // finds the rental already saved instead of creating a second one.
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID())
  const [duplicate, setDuplicate] = useState<ReservationSummary | null>(null)

  const selected = models.find((m) => m.model.id === modelId)
  const ready = Boolean(modelId && sizeId && versionId && range?.from && label.trim())

  function reset() {
    setModelId(''); setSizeId(''); setVersionId(''); setRange(undefined); setLabel('')
    setDuplicate(null)
    setRequestKey(crypto.randomUUID())
  }

  function submit(confirmDuplicate: boolean) {
    if (!range?.from) return
    startTransition(async () => {
      const result = await createRentalAction({
        requestKey, bikeModelId: modelId, bikeSizeId: sizeId, bikeVersionId: versionId,
        firstDay: isoDay(range.from!), lastDay: isoDay(range.to ?? range.from!),
        label, confirmDuplicate,
      })
      switch (result.status) {
        case 'created':
          toast.success(result.replayed ? 'This rental was already saved' : 'Rental added')
          reset()
          onCreated()
          break
        case 'possible_duplicate':
          setDuplicate(result.existing)
          break
        case 'no_bike_free':
          toast.error('No bike of this kind is free on these days')
          break
        case 'try_again':
          toast.error('Too many requests at once. Try again')
          break
        case 'invalid':
          toast.error(result.message)
          break
      }
    })
  }

  return (
    <form onSubmit={(event) => { event.preventDefault(); if (ready && !isPending) submit(false) }} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="rental-model">Model *</Label>
        <Select value={modelId} onValueChange={(id) => { setModelId(id); setSizeId(''); setVersionId('') }}>
          <SelectTrigger id="rental-model"><SelectValue placeholder="Choose a model" /></SelectTrigger>
          <SelectContent>
            {models.map((m) => <SelectItem key={m.model.id} value={m.model.id}>{m.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {selected && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="rental-size">Size *</Label>
            <Select value={sizeId} onValueChange={setSizeId}>
              <SelectTrigger id="rental-size"><SelectValue placeholder="Size" /></SelectTrigger>
              <SelectContent>
                {selected.allowedSizes.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="rental-version">Version *</Label>
            <Select value={versionId} onValueChange={setVersionId}>
              <SelectTrigger id="rental-version"><SelectValue placeholder="Version" /></SelectTrigger>
              <SelectContent>
                {selected.allowedVersions.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="space-y-1">
        <Label>Days *</Label>
        <Calendar mode="range" selected={range} onSelect={setRange} className="rounded-md border" />
        {range?.from && (
          <p className="text-xs text-muted-foreground">
            From {isoDay(range.from)} to {isoDay(range.to ?? range.from)} included
          </p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="rental-name">Name *</Label>
        <Input id="rental-name" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} placeholder="Who is renting" />
      </div>

      <Button type="submit" disabled={isPending || !ready}>Add rental</Button>

      <AlertDialog open={duplicate !== null} onOpenChange={(open) => { if (!open) setDuplicate(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Looks like a rental already entered</AlertDialogTitle>
            <AlertDialogDescription>
              {duplicate && (
                <>A rental for &ldquo;{duplicate.label}&rdquo; already covers {duplicate.startsOn} to {inclusiveEnd(duplicate.endsOn)} for
                this kind of bike. Add another one anyway? It will take a second bike.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Do not add</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setDuplicate(null); submit(true) }}>Add anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  )
}
```

- [ ] **Step 3: Collega il modulo alla pagina e alla vista**

Sostituisci per intero `app/manage/bookings/page.tsx` (ora porta anche i modelli):

```tsx
import { redirect } from 'next/navigation'
import { getAdminUser } from '@/lib/supabase/server'
import { getPublishedModelsWithAllowedOptions } from '@/lib/actions/bike-units'
import { getGrid } from '@/lib/reservations'
import { currentMonthInRome, parseMonth, todayInRome } from '@/lib/dates'
import { BookingView } from '@/components/admin/booking-view'

// Read live: the calendar must be exact, not "within 10-30 seconds" like the cached catalogues.
export const instant = false

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await getAdminUser()
  if (!user) redirect('/manage/login')

  const { month: monthParam } = await searchParams
  const month = parseMonth(monthParam) ?? currentMonthInRome()

  const [units, models] = await Promise.all([getGrid(month), getPublishedModelsWithAllowedOptions()])

  return <BookingView month={month} today={todayInRome()} units={units} models={models} />
}
```

Sostituisci per intero `components/admin/booking-view.tsx` (versione del Task 7: griglia più «New rental»):

```tsx
'use client'
import { Fragment, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { layoutBlocks } from '@/lib/booking-grid'
import {
  dayOfMonth, isWeekendDay, monthDays, monthTitle, shiftMonth, weekdayLetter, type IsoDate, type IsoMonth,
} from '@/lib/dates'
import type { GridUnit } from '@/lib/reservations'
import type { ModelOption } from '@/components/admin/booking-types'
import { useReservationsRealtime } from '@/components/admin/use-reservations-realtime'
import { RentalForm } from '@/components/admin/rental-form'

interface BookingViewProps {
  month: IsoMonth
  today: IsoDate
  units: GridUnit[]
  models: ModelOption[]
}

const LABEL_COLUMN = 'minmax(11rem, 14rem)'

export function BookingView({ month, today, units, models }: BookingViewProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [rentalOpen, setRentalOpen] = useState(false)
  const days = monthDays(month)

  const reload = () => startTransition(() => router.refresh())
  // The ping carries nothing to trust: the grid is simply read again.
  useReservationsRealtime(reload)

  const columns = `${LABEL_COLUMN} repeat(${days.length}, minmax(2rem, 1fr))`

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[#1e3a5f]">Bookings</h1>
        <div className="flex items-center gap-2">
          <Button onClick={() => setRentalOpen(true)}><Plus size={16} className="mr-1" />New rental</Button>
          <Button asChild variant="outline" size="icon" aria-label="Previous month">
            <Link href={`/manage/bookings?month=${shiftMonth(month, -1)}`}><ChevronLeft size={16} /></Link>
          </Button>
          <span className="min-w-36 text-center font-medium">{monthTitle(month)}</span>
          <Button asChild variant="outline" size="icon" aria-label="Next month">
            <Link href={`/manage/bookings?month=${shiftMonth(month, 1)}`}><ChevronRight size={16} /></Link>
          </Button>
        </div>
      </div>

      <Legend />

      {units.length === 0 ? (
        <p className="text-sm text-muted-foreground">No bikes in the shop yet. Add them in Shop first.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <div className="grid min-w-max" style={{ gridTemplateColumns: columns }}>
            <div className="sticky left-0 z-10 border-b bg-card p-2 text-xs font-medium text-muted-foreground">Bike</div>
            {days.map((day) => (
              <div
                key={day}
                className={cn(
                  'border-b border-l p-1 text-center text-[10px] leading-tight text-muted-foreground',
                  isWeekendDay(day) && 'bg-muted/50',
                  day === today && 'bg-[#366DA1]/15 font-semibold text-foreground',
                )}
              >
                <div>{weekdayLetter(day)}</div>
                <div className="text-xs">{dayOfMonth(day)}</div>
              </div>
            ))}

            {units.map((unit, index) => (
              <Fragment key={unit.id}>
                {(index === 0 || units[index - 1].modelName !== unit.modelName) && (
                  <div className="col-span-full border-b bg-muted/40 px-2 py-1 text-xs font-semibold text-[#1e3a5f]">
                    {unit.modelName}
                  </div>
                )}
                <UnitRow unit={unit} month={month} days={days} today={today} />
              </Fragment>
            ))}
          </div>
        </div>
      )}

      <Dialog open={rentalOpen} onOpenChange={setRentalOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New rental</DialogTitle></DialogHeader>
          <RentalForm models={models} onCreated={() => { setRentalOpen(false); reload() }} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5"><span className="inline-block size-3 rounded-sm bg-[#366DA1]" />Rental</span>
      <span className="flex items-center gap-1.5"><span className="inline-block size-3 rounded-sm bg-amber-300" />Maintenance</span>
    </div>
  )
}

function UnitRow({ unit, month, days, today }: { unit: GridUnit; month: IsoMonth; days: IsoDate[]; today: IsoDate }) {
  const blocks = layoutBlocks(month, unit.reservations)

  return (
    <>
      <div className="sticky left-0 z-10 flex flex-col justify-center border-b bg-card px-2 py-1">
        <span className="font-mono text-[10px] text-muted-foreground">{unit.shortId}</span>
        <span className="text-xs">{unit.sizeName} · {unit.versionName}</span>
      </div>
      <div
        className="relative grid min-h-10 border-b"
        style={{ gridColumn: `2 / span ${days.length}`, gridTemplateColumns: `repeat(${days.length}, minmax(2rem, 1fr))` }}
      >
        {days.map((day, i) => (
          <div
            key={day}
            className={cn('border-l', isWeekendDay(day) && 'bg-muted/50', day === today && 'bg-[#366DA1]/10')}
            style={{ gridColumn: i + 1, gridRow: 1 }}
          />
        ))}
        {blocks.map((block) => (
          <div
            key={block.reservationId}
            title={block.label ?? undefined}
            className={cn(
              'z-[1] my-1 truncate px-1.5 text-xs leading-7',
              block.kind === 'maintenance' ? 'bg-amber-300 text-amber-950' : 'bg-[#366DA1] text-white',
              block.clippedStart ? 'rounded-l-none' : 'rounded-l-md',
              block.clippedEnd ? 'rounded-r-none' : 'rounded-r-md',
            )}
            style={{ gridColumn: `${block.startColumn} / span ${block.span}`, gridRow: 1 }}
          >
            {block.label ?? (block.kind === 'maintenance' ? 'Maintenance' : '')}
          </div>
        ))}
      </div>
    </>
  )
}
```

- [ ] **Step 4: Verifica tipi, lint, suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: verde.

- [ ] **Step 5: Prova a mano (sviluppo)**

Run: `npm run dev`; in `/manage/bookings` premi «New rental».
Expected, in ordine:
1. Scegli modello, taglia, versione, un intervallo di giorni, un nome → «Add rental»: il blocco compare nella griglia della bici assegnata.
2. Premi «Add rental» due volte di seguito molto in fretta: compare **un solo** noleggio (il pulsante si disattiva, e comunque la chiave è la stessa).
3. Reinserisci lo stesso nome con gli stessi giorni: compare «Looks like a rental already entered»; «Do not add» chiude senza inserire; «Add anyway» inserisce sulla seconda bici.
4. Riempi tutte le bici di quel tipo nelle stesse date e riprova: «No bike of this kind is free on these days».

- [ ] **Step 6: Commit**

```bash
git add components/ui/calendar.tsx components/admin/rental-form.tsx components/admin/booking-view.tsx app/manage/bookings package.json package-lock.json
git commit -m "Add the new rental form: calendar range, idempotency key, duplicate warning"
```

---

## Task 8: Il dettaglio di una prenotazione e la manutenzione

**Files:**
- Create: `components/admin/reservation-dialog.tsx`, `components/admin/maintenance-form.tsx`
- Modify (sostituito per intero): `components/admin/booking-view.tsx`

**Interfaces:**
- Consumes: Task 4 (tutte le azioni), Task 6 (`occupiedDayRanges`, `GridUnit`, `GridReservation`), Task 7 (`Calendar`), Task 1 (`dayToDate`, `isoDay`, `inclusiveEnd`).
- Produces: `ReservationDialog({ unit, reservation, onClose }: { unit: GridUnit; reservation: GridReservation; onClose: () => void })` (la vista lo monta solo quando c'è una prenotazione selezionata), `MaintenanceForm({ unit, onPlanned }: { unit: GridUnit; onPlanned: () => void })`.

- [ ] **Step 1: Il modulo di manutenzione** — `components/admin/maintenance-form.tsx`

```tsx
'use client'
import { useEffect, useState, useTransition } from 'react'
import type { DateRange } from 'react-day-picker'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getOccupiedRangesAction, planMaintenanceAction } from '@/lib/actions/reservations'
import { occupiedDayRanges } from '@/lib/booking-grid'
import { inclusiveEnd, isoDay, type DayRange } from '@/lib/dates'
import type { GridUnit } from '@/lib/reservations'

export function MaintenanceForm({ unit, onPlanned }: { unit: GridUnit; onPlanned: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [occupied, setOccupied] = useState<DayRange[]>([])
  const [range, setRange] = useState<DateRange | undefined>()
  const [reason, setReason] = useState('')
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID())

  useEffect(() => {
    let cancelled = false
    getOccupiedRangesAction({ bikeUnitId: unit.id }).then((ranges) => { if (!cancelled) setOccupied(ranges) })
    return () => { cancelled = true }
  }, [unit.id])

  function submit() {
    if (!range?.from) return
    startTransition(async () => {
      const result = await planMaintenanceAction({
        requestKey, bikeUnitId: unit.id,
        firstDay: isoDay(range.from!), lastDay: isoDay(range.to ?? range.from!),
        label: reason,
      })
      switch (result.status) {
        case 'planned':
          toast.success('Maintenance planned')
          setRequestKey(crypto.randomUUID())
          onPlanned()
          break
        case 'conflict':
          toast.error(
            result.conflicts.length > 0
              ? `Already booked: ${result.conflicts.map((c) => `${c.label ?? 'maintenance'} (${c.startsOn} to ${inclusiveEnd(c.endsOn)})`).join(', ')}. Move those rentals first.`
              : 'Those days are no longer free',
          )
          break
        case 'unknown_bike':
          toast.error('This bike no longer exists')
          break
        case 'invalid':
          toast.error(result.message)
          break
      }
    })
  }

  return (
    <form onSubmit={(event) => { event.preventDefault(); if (range?.from && !isPending) submit() }} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {unit.modelName} · {unit.sizeName} · {unit.versionName}
        <span className="ml-2 font-mono text-xs">{unit.shortId}</span>
      </p>
      <div className="space-y-1">
        <Label>From and to *</Label>
        {/* Days this bike is already booked are disabled, and a range cannot cross them. */}
        <Calendar
          mode="range" selected={range} onSelect={setRange}
          disabled={occupiedDayRanges(occupied)} excludeDisabled
          className="rounded-md border"
        />
        {range?.from && (
          <p className="text-xs text-muted-foreground">
            From {isoDay(range.from)} to {isoDay(range.to ?? range.from)} included
          </p>
        )}
      </div>
      <div className="space-y-1">
        <Label htmlFor="maintenance-reason">Reason</Label>
        <Input id="maintenance-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={120} placeholder="Optional" />
      </div>
      <Button type="submit" disabled={isPending || !range?.from}>Plan maintenance</Button>
    </form>
  )
}
```

- [ ] **Step 2: Il dettaglio** — `components/admin/reservation-dialog.tsx`

```tsx
'use client'
import { useEffect, useState, useTransition } from 'react'
import type { DateRange } from 'react-day-picker'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  cancelReservationAction, getMoveCandidatesAction, getOccupiedRangesAction, moveReservationAction,
  updateMaintenanceAction,
} from '@/lib/actions/reservations'
import { occupiedDayRanges } from '@/lib/booking-grid'
import { dayToDate, inclusiveEnd, isoDay, type DayRange } from '@/lib/dates'
import type { GridReservation, GridUnit, MoveCandidate } from '@/lib/reservations'

type Mode = 'view' | 'move' | 'edit'

export function ReservationDialog({
  unit, reservation, onClose,
}: { unit: GridUnit; reservation: GridReservation; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <Body key={reservation.id} unit={unit} reservation={reservation} onClose={onClose} />
      </DialogContent>
    </Dialog>
  )
}

function Body({ unit, reservation, onClose }: { unit: GridUnit; reservation: GridReservation; onClose: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [mode, setMode] = useState<Mode>('view')
  const [confirmCancel, setConfirmCancel] = useState(false)
  const isMaintenance = reservation.kind === 'maintenance'
  const lastDay = inclusiveEnd(reservation.endsOn)

  // The reservation may have changed under this dialog (another tab, another person): the
  // answers below say so, and the grid behind reloads on its own.
  function handleStale(status: string) {
    if (status === 'not_found') {
      toast.error('This was already changed or removed')
      onClose()
      return true
    }
    return false
  }

  function cancel() {
    startTransition(async () => {
      const result = await cancelReservationAction({ id: reservation.id })
      if (result.status === 'invalid') return void toast.error(result.message)
      if (handleStale(result.status)) return
      toast.success(isMaintenance ? 'Maintenance cancelled' : 'Rental cancelled')
      onClose()
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isMaintenance ? 'Maintenance' : (reservation.label ?? 'Rental')}</DialogTitle>
        <DialogDescription>
          {unit.modelName} · {unit.sizeName} · {unit.versionName} · {unit.shortId}
          <br />
          {reservation.startsOn} to {lastDay} included
          {isMaintenance && reservation.label ? ` · ${reservation.label}` : ''}
        </DialogDescription>
      </DialogHeader>

      {mode === 'view' && (
        <div className="flex flex-wrap gap-2">
          {isMaintenance
            ? <Button variant="outline" onClick={() => setMode('edit')}>Change dates</Button>
            : <Button variant="outline" onClick={() => setMode('move')}>Move to another bike</Button>}
          <Button variant="destructive" disabled={isPending} onClick={() => setConfirmCancel(true)}>
            {isMaintenance ? 'Cancel maintenance' : 'Cancel rental'}
          </Button>
        </div>
      )}

      {mode === 'move' && (
        <MovePicker reservationId={reservation.id} onBack={() => setMode('view')} onStale={handleStale} onDone={onClose} />
      )}

      {mode === 'edit' && (
        <EditMaintenance reservation={reservation} unitId={unit.id} onBack={() => setMode('view')} onStale={handleStale} onDone={onClose} />
      )}

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isMaintenance ? 'Cancel this maintenance?' : 'Cancel this rental?'}</AlertDialogTitle>
            <AlertDialogDescription>The days become free again. The entry stays in the history.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={cancel}>Cancel it</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function MovePicker({
  reservationId, onBack, onStale, onDone,
}: { reservationId: string; onBack: () => void; onStale: (status: string) => boolean; onDone: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [candidates, setCandidates] = useState<MoveCandidate[] | null>(null)

  useEffect(() => {
    let cancelled = false
    getMoveCandidatesAction({ id: reservationId }).then((list) => { if (!cancelled) setCandidates(list) })
    return () => { cancelled = true }
  }, [reservationId])

  function move(bikeUnitId: string) {
    startTransition(async () => {
      const result = await moveReservationAction({ id: reservationId, bikeUnitId })
      if (result.status === 'invalid') return void toast.error(result.message)
      if (onStale(result.status)) return
      if (result.status === 'conflict') return void toast.error('That bike was just taken for these days')
      if (result.status === 'unknown_bike') return void toast.error('That bike no longer exists')
      toast.success('Rental moved')
      onDone()
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Free bikes on these days</p>
      {candidates === null && <p className="text-sm text-muted-foreground">Loading…</p>}
      {candidates?.length === 0 && <p className="text-sm text-muted-foreground">No other bike is free on these days.</p>}
      <ul className="space-y-1">
        {candidates?.map((c) => (
          <li key={c.bikeUnitId} className="flex items-center justify-between rounded-md border p-2 text-sm">
            <span>
              {c.modelName} · {c.sizeName} · {c.versionName}
              <span className="ml-2 font-mono text-xs text-muted-foreground">{c.shortId}</span>
              {c.sameModelAndSize && <span className="ml-2 text-xs text-[#366DA1]">same model and size</span>}
            </span>
            <Button size="sm" disabled={isPending} onClick={() => move(c.bikeUnitId)}>Move here</Button>
          </li>
        ))}
      </ul>
      <Button variant="ghost" onClick={onBack}>Back</Button>
    </div>
  )
}

function EditMaintenance({
  reservation, unitId, onBack, onStale, onDone,
}: {
  reservation: GridReservation; unitId: string
  onBack: () => void; onStale: (status: string) => boolean; onDone: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [occupied, setOccupied] = useState<DayRange[]>([])
  const [range, setRange] = useState<DateRange | undefined>({
    from: dayToDate(reservation.startsOn), to: dayToDate(inclusiveEnd(reservation.endsOn)),
  })

  useEffect(() => {
    let cancelled = false
    getOccupiedRangesAction({ bikeUnitId: unitId, excludeId: reservation.id }).then((r) => { if (!cancelled) setOccupied(r) })
    return () => { cancelled = true }
  }, [unitId, reservation.id])

  function save() {
    if (!range?.from) return
    startTransition(async () => {
      const result = await updateMaintenanceAction({
        id: reservation.id, firstDay: isoDay(range.from!), lastDay: isoDay(range.to ?? range.from!),
      })
      if (result.status === 'invalid') return void toast.error(result.message)
      if (onStale(result.status)) return
      if (result.status === 'conflict') {
        return void toast.error('Some of those days are already booked. Move those rentals first.')
      }
      toast.success('Maintenance updated')
      onDone()
    })
  }

  return (
    <div className="space-y-3">
      <Calendar
        mode="range" selected={range} onSelect={setRange} defaultMonth={range?.from}
        disabled={occupiedDayRanges(occupied)} excludeDisabled className="rounded-md border"
      />
      <div className="flex gap-2">
        <Button disabled={isPending || !range?.from} onClick={save}>Save dates</Button>
        <Button variant="ghost" onClick={onBack}>Back</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Collega dettaglio e manutenzione alla vista**

Sostituisci per intero `components/admin/booking-view.tsx` (versione finale):

```tsx
'use client'
import { Fragment, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Plus, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { layoutBlocks } from '@/lib/booking-grid'
import {
  dayOfMonth, isWeekendDay, monthDays, monthTitle, shiftMonth, weekdayLetter, type IsoDate, type IsoMonth,
} from '@/lib/dates'
import type { GridReservation, GridUnit } from '@/lib/reservations'
import type { ModelOption } from '@/components/admin/booking-types'
import { useReservationsRealtime } from '@/components/admin/use-reservations-realtime'
import { RentalForm } from '@/components/admin/rental-form'
import { MaintenanceForm } from '@/components/admin/maintenance-form'
import { ReservationDialog } from '@/components/admin/reservation-dialog'

interface BookingViewProps {
  month: IsoMonth
  today: IsoDate
  units: GridUnit[]
  models: ModelOption[]
}

const LABEL_COLUMN = 'minmax(11rem, 14rem)'

export function BookingView({ month, today, units, models }: BookingViewProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [rentalOpen, setRentalOpen] = useState(false)
  const [selected, setSelected] = useState<{ unit: GridUnit; reservation: GridReservation } | null>(null)
  const [maintenanceUnit, setMaintenanceUnit] = useState<GridUnit | null>(null)
  const days = monthDays(month)

  const reload = () => startTransition(() => router.refresh())
  // The ping carries nothing to trust: the grid is simply read again.
  useReservationsRealtime(reload)

  const columns = `${LABEL_COLUMN} repeat(${days.length}, minmax(2rem, 1fr))`

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[#1e3a5f]">Bookings</h1>
        <div className="flex items-center gap-2">
          <Button onClick={() => setRentalOpen(true)}><Plus size={16} className="mr-1" />New rental</Button>
          <Button asChild variant="outline" size="icon" aria-label="Previous month">
            <Link href={`/manage/bookings?month=${shiftMonth(month, -1)}`}><ChevronLeft size={16} /></Link>
          </Button>
          <span className="min-w-36 text-center font-medium">{monthTitle(month)}</span>
          <Button asChild variant="outline" size="icon" aria-label="Next month">
            <Link href={`/manage/bookings?month=${shiftMonth(month, 1)}`}><ChevronRight size={16} /></Link>
          </Button>
        </div>
      </div>

      <Legend />

      {units.length === 0 ? (
        <p className="text-sm text-muted-foreground">No bikes in the shop yet. Add them in Shop first.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <div className="grid min-w-max" style={{ gridTemplateColumns: columns }}>
            <div className="sticky left-0 z-10 border-b bg-card p-2 text-xs font-medium text-muted-foreground">Bike</div>
            {days.map((day) => (
              <div
                key={day}
                className={cn(
                  'border-b border-l p-1 text-center text-[10px] leading-tight text-muted-foreground',
                  isWeekendDay(day) && 'bg-muted/50',
                  day === today && 'bg-[#366DA1]/15 font-semibold text-foreground',
                )}
              >
                <div>{weekdayLetter(day)}</div>
                <div className="text-xs">{dayOfMonth(day)}</div>
              </div>
            ))}

            {units.map((unit, index) => (
              <Fragment key={unit.id}>
                {(index === 0 || units[index - 1].modelName !== unit.modelName) && (
                  <div className="col-span-full border-b bg-muted/40 px-2 py-1 text-xs font-semibold text-[#1e3a5f]">
                    {unit.modelName}
                  </div>
                )}
                <UnitRow
                  unit={unit} month={month} days={days} today={today}
                  onSelect={(reservation) => setSelected({ unit, reservation })}
                  onPlanMaintenance={() => setMaintenanceUnit(unit)}
                />
              </Fragment>
            ))}
          </div>
        </div>
      )}

      <Dialog open={rentalOpen} onOpenChange={setRentalOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New rental</DialogTitle></DialogHeader>
          <RentalForm models={models} onCreated={() => { setRentalOpen(false); reload() }} />
        </DialogContent>
      </Dialog>

      {selected && (
        <ReservationDialog unit={selected.unit} reservation={selected.reservation} onClose={() => { setSelected(null); reload() }} />
      )}

      <Dialog open={maintenanceUnit !== null} onOpenChange={(open) => { if (!open) setMaintenanceUnit(null) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Plan maintenance</DialogTitle></DialogHeader>
          {maintenanceUnit && (
            <MaintenanceForm unit={maintenanceUnit} onPlanned={() => { setMaintenanceUnit(null); reload() }} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5"><span className="inline-block size-3 rounded-sm bg-[#366DA1]" />Rental</span>
      <span className="flex items-center gap-1.5"><span className="inline-block size-3 rounded-sm bg-amber-300" />Maintenance</span>
    </div>
  )
}

interface UnitRowProps {
  unit: GridUnit
  month: IsoMonth
  days: IsoDate[]
  today: IsoDate
  onSelect: (reservation: GridReservation) => void
  onPlanMaintenance: () => void
}

function UnitRow({ unit, month, days, today, onSelect, onPlanMaintenance }: UnitRowProps) {
  const blocks = layoutBlocks(month, unit.reservations)
  const byId = new Map(unit.reservations.map((reservation) => [reservation.id, reservation]))

  return (
    <>
      <div className="sticky left-0 z-10 flex items-center justify-between border-b bg-card px-2 py-1">
        <div className="flex flex-col justify-center">
          <span className="font-mono text-[10px] text-muted-foreground">{unit.shortId}</span>
          <span className="text-xs">{unit.sizeName} · {unit.versionName}</span>
        </div>
        <Button variant="ghost" size="icon" className="size-7" aria-label="Plan maintenance" onClick={onPlanMaintenance}>
          <Wrench size={14} />
        </Button>
      </div>
      <div
        className="relative grid min-h-10 border-b"
        style={{ gridColumn: `2 / span ${days.length}`, gridTemplateColumns: `repeat(${days.length}, minmax(2rem, 1fr))` }}
      >
        {days.map((day, i) => (
          <div
            key={day}
            className={cn('border-l', isWeekendDay(day) && 'bg-muted/50', day === today && 'bg-[#366DA1]/10')}
            style={{ gridColumn: i + 1, gridRow: 1 }}
          />
        ))}
        {blocks.map((block) => (
          <button
            type="button"
            key={block.reservationId}
            onClick={() => onSelect(byId.get(block.reservationId)!)}
            title={block.label ?? undefined}
            className={cn(
              'z-[1] my-1 cursor-pointer truncate px-1.5 text-left text-xs leading-7',
              block.kind === 'maintenance' ? 'bg-amber-300 text-amber-950' : 'bg-[#366DA1] text-white',
              block.clippedStart ? 'rounded-l-none' : 'rounded-l-md',
              block.clippedEnd ? 'rounded-r-none' : 'rounded-r-md',
            )}
            style={{ gridColumn: `${block.startColumn} / span ${block.span}`, gridRow: 1 }}
          >
            {block.label ?? (block.kind === 'maintenance' ? 'Maintenance' : '')}
          </button>
        ))}
      </div>
    </>
  )
}
```

- [ ] **Step 4: Verifica tipi, lint, suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: verde.

- [ ] **Step 5: Prova a mano (sviluppo)**

Run: `npm run dev`; in `/manage/bookings`:
1. Clic su un noleggio: si apre il dettaglio con date (ultimo giorno **incluso**). «Move to another bike» elenca le bici libere, prima quelle dello stesso modello e taglia; «Move here» lo sposta e la griglia si aggiorna.
2. «Cancel rental» chiede conferma, libera i giorni; il blocco sparisce.
3. L'icona della chiave inglese su una riga apre «Plan maintenance»: nel calendario i giorni già occupati da quella bici sono **disabilitati** e non si può selezionare un intervallo che li attraversa. Pianifica un intervallo libero: il blocco giallo compare.
4. Clic sul blocco giallo → «Change dates»: allunga fino a un giorno occupato e salva: «Some of those days are already booked».
5. **Due schede**: apri la stessa pagina in due schede, annulla un noleggio da una. L'altra si aggiorna da sola entro un paio di secondi (il campanello). Nell'altra scheda, apri il dettaglio di quel noleggio prima dell'annullamento e premi «Cancel rental» dopo: «This was already changed or removed» e la finestra si chiude.

- [ ] **Step 6: Commit**

```bash
git add components/admin
git commit -m "Add the reservation detail (cancel, move) and maintenance (plan, change dates) with days already booked disabled"
```

---

## Task 9: L'elenco «Shop»

**Files:**
- Modify: `app/manage/bikes/shop/page.tsx`, `components/admin/bike-unit-list.tsx`

**Interfaces:**
- Consumes: Task 3 (`getMaintenanceByUnit`, `MaintenanceInfo`), Task 4 (`deleteBikeUnitAction` che risponde), Task 1 (`todayInRome`, `inclusiveEnd`).
- Produces: nulla di nuovo per altri task.

- [ ] **Step 1: La pagina passa la manutenzione all'elenco** — `app/manage/bikes/shop/page.tsx`

```tsx
import { getAdminUser } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getBikeUnitsForAdmin, getPublishedModelsWithAllowedOptions } from '@/lib/actions/bike-units'
import { getMaintenanceByUnit } from '@/lib/reservations'
import { todayInRome } from '@/lib/dates'
import { BikeUnitForm } from '@/components/admin/bike-unit-form'
import { BikeUnitList } from '@/components/admin/bike-unit-list'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function BikeShopPage() {
  const user = await getAdminUser()
  if (!user) redirect('/manage/login')

  const [units, models, maintenance] = await Promise.all([
    getBikeUnitsForAdmin(),
    getPublishedModelsWithAllowedOptions(),
    getMaintenanceByUnit(todayInRome()),
  ])

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-[#1e3a5f]">Shop</h1>
      <BikeUnitForm models={models} />
      <BikeUnitList units={units} maintenance={maintenance} />
    </div>
  )
}
```

- [ ] **Step 2: L'elenco mostra la manutenzione e il rifiuto** — `components/admin/bike-unit-list.tsx`

```tsx
'use client'
import { useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { deleteBikeUnitAction } from '@/lib/actions/bike-units'
import { inclusiveEnd } from '@/lib/dates'
import type { BikeUnit } from '@/lib/db'
import type { MaintenanceInfo } from '@/lib/reservations'

interface UnitRow {
  unit: BikeUnit
  modelName: string | null
  sizeName: string
  versionName: string
}

export function BikeUnitList({ units, maintenance }: { units: UnitRow[]; maintenance: Record<string, MaintenanceInfo> }) {
  const [isPending, startTransition] = useTransition()

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteBikeUnitAction(id)
      if (!result.ok) {
        toast.error('This bike has reservations, even cancelled ones, so it cannot be removed')
        return
      }
      toast.success('Bike removed from the shop')
    })
  }

  if (units.length === 0) {
    return <p className="text-muted-foreground text-sm">No bikes in the shop yet.</p>
  }

  return (
    <div className="space-y-2">
      {units.map(({ unit, modelName, sizeName, versionName }) => {
        const block = maintenance[unit.id]
        return (
          <div key={unit.id} className="flex items-center justify-between p-3 bg-card border rounded-lg">
            <div className="space-y-0.5">
              <p className="font-mono text-xs text-muted-foreground">{unit.id.slice(0, 8)}</p>
              <p className="text-sm font-medium">{modelName ?? 'Untitled'}</p>
              <p className="text-xs text-muted-foreground">{sizeName} · {versionName}</p>
              {block && (
                <p className="text-xs font-medium text-amber-700">
                  {block.active
                    ? `Maintenance until ${inclusiveEnd(block.endsOn)}`
                    : `Maintenance from ${block.startsOn}`}
                </p>
              )}
            </div>
            <Button
              size="icon" variant="ghost" className="text-destructive"
              disabled={isPending}
              onClick={() => handleDelete(unit.id)}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Verifica tipi, lint, suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: verde.

- [ ] **Step 4: Prova a mano (sviluppo)**

Run: `npm run dev`; in `/manage/bikes/shop`:
1. Una bici con una manutenzione in corso mostra «Maintenance until <ultimo giorno incluso>»; una con manutenzione futura «Maintenance from <data>».
2. Il cestino su una bici con prenotazioni (anche annullate) dà «This bike has reservations… cannot be removed» e la bici resta; su una bici mai prenotata la rimuove.

- [ ] **Step 5: Commit**

```bash
git add app/manage/bikes/shop/page.tsx components/admin/bike-unit-list.tsx
git commit -m "Show maintenance on the Shop list; deleting a reserved bike explains why it stays"
```

### Fine della fase C

- [ ] **Apri la PR verso `staging`**

```bash
git push -u origin feat/booking-slice1-c
gh pr create --base staging --title "Booking slice 1, part C: the bookings page" --body "Task 6-9 del piano: griglia, nuovo noleggio, dettaglio, manutenzione, elenco Shop."
```

---

# Fase D — Rilascio

## Task 10: Prova su `staging`, produzione e documenti

**Files:**
- Modify: `docs/ai/STATE.md`, `docs/ai/ROADMAP.md`

**Interfaces:**
- Consumes: tutto.
- Produces: la fetta 1 in produzione; la documentazione allineata.

- [ ] **Step 1: Prova a mano su `https://staging.lelettricaleoni.com`**

Dopo che le fasi A-C sono su `staging` e il deploy è terminato, in `/manage/bookings` (login admin) ripeti i controlli dei Task 7, 8 e 9 e in più:
1. **Telefono**: la griglia scorre in orizzontale e il nome della bici resta visibile a sinistra; i moduli sono usabili.
2. **Tempo reale tra due dispositivi**: crea un noleggio dal telefono e guarda il computer.
3. **Nessun dettaglio infrastrutturale** nei testi (niente nomi di servizi).

Atteso: tutto come nei Task 7-9, sul database di Preview.

- [ ] **Step 2: Verifica sicurezza dei nuovi oggetti sul database di sviluppo**

Con l'MCP `supabase-dev`, `get_advisors` di tipo `security`.
Expected: **nessun** avviso nuovo su `bike_reservations` né su `notify_reservation_change` (gli avvisi preesistenti su altre tabelle sono quelli già annotati in `ROADMAP.md`, da risolvere a parte).

- [ ] **Step 3: Controlla Realtime in produzione**

Nella dashboard del progetto di produzione (`hhfnhzdourgkinwlqvtc`) → Realtime → Settings: **«Allow public access»** attivo. Senza, i canali pubblici non funzionano e il calendario non si aggiorna da solo (funziona comunque al ricaricamento).

- [ ] **Step 4: Applica le migrazioni al database di produzione**

La connessione diretta di produzione si prende dalla dashboard Supabase del progetto (Project Settings → Database → Direct connection, vedi `docs/environment-variables.md`) e si passa **a mano**, senza scriverla in nessun file:

```bash
DATABASE_DIRECT_URL='<connessione diretta di produzione>' npm run db:migrate
```

(`node --env-file=.env.local` non sovrascrive una variabile già presente nell'ambiente.) Expected: applica `0010` e `0011` senza errori.

Verifica con l'MCP `supabase` (produzione), `execute_sql`:

```sql
select conname from pg_constraint where conrelid = 'public.bike_reservations'::regclass order by conname;
select relrowsecurity from pg_class where oid = 'public.bike_reservations'::regclass;
select tgname from pg_trigger where tgrelid = 'public.bike_reservations'::regclass and not tgisinternal;
select has_function_privilege('anon', 'public.notify_reservation_change()', 'execute') as anon_can_run;
```
Expected: i cinque vincoli del Task 2; `true`; `bike_reservations_notify`; `false`. Poi `get_advisors` di tipo `security` sulla produzione: nessun avviso nuovo.

- [ ] **Step 5: Allinea la documentazione** (su un ramo da `main`, PR separata)

In `docs/ai/STATE.md`:
- sotto «Dati e servizi» o «Decisioni vincolanti»: la tabella `bike_reservations` (una riga per bici e periodo, `EXCLUDE` su `during`, `ends_on` esclusivo, `request_key`), il fatto che i controlli contro i doppioni sono a livelli e **che il vincolo non vede lo stesso noleggio inserito due volte con due bici libere** (lo coprono `request_key` e l'avviso), e il campanello Realtime dal trigger (mai dati personali: i canali pubblici sono ascoltabili da chiunque);
- sotto «Trappole»: `npm run test:db` esiste ed è solo contro lo sviluppo; le tabelle nuove su sviluppo/Preview nascono senza RLS (in produzione c'è `ensure_rls`), quindi l'RLS va esplicito nella migrazione; `staging` e `main` si sincronizzano con **merge commit**, mai squash;
- aggiorna la riga del branch `staging` se è cambiato qualcosa.

In `docs/ai/ROADMAP.md`: la voce «Sistema di prenotazioni» passa da «brainstorming» a «fetta 1 fatta e in produzione»; restano le fette 2-5.

(La decisione sulla griglia è già nella spec, scritta con questo piano.)

- [ ] **Step 6: Sincronizza `staging` con `main` e rilascia**

Con merge commit, **mai squash**:

```bash
git fetch origin
gh pr create --base staging --head main --title "Sync staging with main" --body "Porta in staging i commit di main."   # se main è avanti
gh pr merge <numero> --merge

gh pr create --base main --head staging --title "Booking slice 1: the admin calendar" --body "Fetta 1 del sistema di prenotazioni, solo pannello: calendario bici × giorni, noleggi al banco, manutenzione, controlli contro i doppioni, aggiornamenti in tempo reale. Migrazioni 0010 e 0011 già applicate alla produzione."
gh pr merge <numero> --merge
```

Non aspettare i check: unisci quando sono verdi sullo stesso commit (`headRefOid`). Dopo il merge `staging` e `main` condividono la storia.

- [ ] **Step 7: Prova di fumo in produzione**

Su `https://www.lelettricaleoni.com/manage/bookings` (login admin): la griglia compare, un noleggio di prova si crea, si sposta, si annulla; due schede si aggiornano a vicenda. Poi **cancella i dati di prova** dal calendario (annulla i noleggi di prova: restano nello storico come `cancelled`).

Verifica che il sito pubblico non sia cambiato: `/it`, `/it/bikes` rispondono come prima (guarda il contenuto, non il codice HTTP).

- [ ] **Step 8: Fine**

Kevin può cominciare a registrare i noleggi veri. Le fette 2-5 (account cliente, prenotazione dal sito con Stripe, email, appuntamenti di riparazione) restano su `staging`.

---

## Copertura della spec (autocontrollo)

| Requisito della spec | Dove |
|---|---|
| Tabella `bike_reservations`, due colonne `date`, `daterange` generato, vincolo di esclusione `WHERE status='confirmed'` | Task 2 |
| `CHECK ends_on > starts_on`, `request_key` `UNIQUE`, `ends_on` mai nullo | Task 2 |
| Libreria di date e `lib/dates.ts`, «oggi» in `Europe/Rome`, fine inclusiva/esclusiva solo lì | Task 1 |
| Noleggio al banco: assegnazione automatica, ritentativo su `23P01`, solo bici/date/nome | Task 3 |
| Annullare non cancella (`cancelled`), date libere | Task 3 |
| Sposta su un'altra bici, candidati dello stesso modello e taglia per primi | Task 3, 8 |
| Manutenzione con inizio e fine, scelta su giorni liberi, conflitti con elenco | Task 3, 8 |
| Modifica o annulla la manutenzione | Task 3, 8 |
| Non si elimina una bici con prenotazioni | Task 3, 4, 9 |
| Controlli contro l'inserimento doppio: pulsante, `request_key`, avviso di doppione, dati freschi, vincolo, tempo reale | Task 3, 7, 5 |
| Tempo reale dal trigger, solo campanello, riconnessione e scheda visibile | Task 5 |
| `zod` (`z.iso.date()`, `z.uuid()`), Server Action con `requireAdmin()`, niente transazioni | Task 4 |
| Pannello: voce «Bookings», griglia, mese nell'URL, dettaglio, nuovo noleggio, nuova manutenzione, lista Shop | Task 6, 7, 8, 9 |
| Letture dal vivo, niente `'use cache'` | Task 6 |
| Prove: unitarie, concorrenza sul database, doppioni | Task 1, 3, 4, 6 |
| RLS esplicito e `REVOKE` sulla funzione (avvisi di sicurezza di Supabase) | Task 2, 5, 10 |
| Rilascio: `staging`, eccezione per la fetta 1, migrazione di produzione | Setup, Task 10 |
| Limiti della pagina pubblica non implementati | (nessun task: fuori da questa fetta) |

---

## Aggiunte dopo l'esecuzione (2026-10-02)

Il piano è stato eseguito in modo nativo, con i task 1-9 nelle PR #227, #228, #229. La revisione
dell'intero ramo ha prodotto altre due PR, **non previste dal piano**:

- **#230, correzioni**: `/manage/bookings` non aveva `layout.tsx`, quindi niente `AdminShell` e
  niente `Toaster` (ogni messaggio spariva); i ricaricamenti dal canale pubblico sono limitati a uno
  ogni 250 ms (`lib/coalesce.ts`); il rifiuto dei non-admin è provato per tutte le sette azioni.
- **#231, fase D, bici ritirate** (scelta di Kevin): `bike_units.retired_on`, migrazione `0012`,
  `retireBikeUnit`/`restoreBikeUnit`, regole in assegnazione, spostamento e griglia, pulsanti nella
  lista Shop, filtro `inGarage()` sulle query pubbliche. Vedi la sezione «Bici ritirate» della spec.

Ancora da fare, **il task 10** di sopra: la prova a mano su `staging` con il login admin, le
migrazioni `0010`, `0011` e `0012` sul database di produzione, e la PR `staging → main` con merge
commit.
