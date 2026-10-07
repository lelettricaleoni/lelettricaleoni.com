import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { db, bikeReservations } from '@/lib/db'
import { CHECK_VIOLATION, EXCLUSION_VIOLATION, pgErrorCode } from '@/lib/pg-errors'
import { createFixture, insertBooking, insertOnlineLine, reservationValues, type Fixture } from './fixtures'

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
