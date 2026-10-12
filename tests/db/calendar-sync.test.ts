import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, bikeReservations } from '@/lib/db'
import { createFixture, insertPaidBooking, type Fixture } from './fixtures'

const sync = vi.hoisted(() => ({ syncReservation: vi.fn(async () => undefined) }))
vi.mock('@/lib/integrations/google-calendar/sync', () => sync)

import { syncBookingLines } from '@/lib/booking/calendar-sync'

describe('sending the bikes of a booking to Google Calendar', () => {
  let fx: Fixture
  beforeEach(async () => { fx = await createFixture(3); sync.syncReservation.mockClear() })
  afterEach(async () => { await fx.cleanup() })

  it('sends every bike that is booked or was cancelled (the event of a cancelled one is taken away), once each', async () => {
    const paid = await insertPaidBooking(fx, { startsOn: '2031-12-10', endsOn: '2031-12-13' }, [3000, 4000, 2000])
    await db.update(bikeReservations).set({ status: 'cancelled' }).where(eq(bikeReservations.id, paid.reservationIds[2]))
    await syncBookingLines(paid.bookingId)
    expect(sync.syncReservation.mock.calls.map((call) => (call as unknown as [string])[0]).sort()).toEqual([...paid.reservationIds].sort())
  })

  it('sends nothing for a booking that does not exist, or whose bikes were never booked', async () => {
    await syncBookingLines(crypto.randomUUID())
    expect(sync.syncReservation).not.toHaveBeenCalled()
  })
})
