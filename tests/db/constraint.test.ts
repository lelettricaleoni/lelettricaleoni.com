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
    await insert(reservationValues(fx.unitIds[0], '2031-07-10', '2031-07-13'))
    const rental = { kind: 'counter_rental' as const, customerId: fx.customerId }
    expect(await failureCode(insert(reservationValues(fx.unitIds[0], '2031-07-11', '2031-07-12', rental)))).toBe(EXCLUSION_VIOLATION)
  })

  it('does not accept a rental without a customer, but a maintenance has none', async () => {
    expect(await failureCode(insert(reservationValues(fx.unitIds[0], '2031-07-10', '2031-07-13', { kind: 'counter_rental' })))).toBe(CHECK_VIOLATION)
    expect(await failureCode(insert(reservationValues(fx.unitIds[0], '2031-07-10', '2031-07-13')))).toBeUndefined()
  })

  it('rejects an empty range with the CHECK, and a reversed one before it gets there', async () => {
    expect(await failureCode(insert(reservationValues(fx.unitIds[0], '2031-07-10', '2031-07-10')))).toBe(CHECK_VIOLATION)
    // The generated daterange refuses a lower bound above the upper one (22000, data_exception)
    // before the CHECK is evaluated: rejected either way.
    expect(await failureCode(insert(reservationValues(fx.unitIds[0], '2031-07-12', '2031-07-10')))).toBe('22000')
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
