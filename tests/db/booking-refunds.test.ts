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
