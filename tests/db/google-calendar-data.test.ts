import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { inArray } from 'drizzle-orm'
import { db, customers } from '@/lib/db'
import { cancelReservation, createCounterRental, planMaintenance } from '@/lib/reservations'
import {
  getReservationForCalendar, listReservationIdsOfCustomer, listReservationsForCalendar,
} from '@/lib/integrations/google-calendar/data'
import { createFixture, type Fixture } from './fixtures'

let fx: Fixture
const extraCustomers: string[] = []
beforeEach(async () => { fx = await createFixture(2) })
afterEach(async () => {
  await fx.cleanup()
  if (extraCustomers.length) await db.delete(customers).where(inArray(customers.id, extraCustomers))
  extraCustomers.length = 0
})

async function rent(startsOn: string, endsOn: string) {
  const result = await createCounterRental({
    requestKey: crypto.randomUUID(), bikeModelId: fx.modelId, bikeSizeId: fx.sizeId, bikeVersionId: fx.versionId,
    startsOn, endsOn, customerId: fx.customerId, amountCents: 12300, confirmDuplicate: true,
  })
  if (result.status !== 'created') throw new Error(`expected created, got ${result.status}`)
  return result
}

describe('getReservationForCalendar', () => {
  it('has the bike, the customer and the days, and nothing about money or notes', async () => {
    const { reservationId, bikeUnitId } = await rent('2031-07-10', '2031-07-13')
    const r = await getReservationForCalendar(reservationId)
    expect(r).toMatchObject({
      id: reservationId, kind: 'counter_rental', status: 'confirmed', startsOn: '2031-07-10', endsOn: '2031-07-13',
      shortId: bikeUnitId.slice(0, 8), customerPhone: null, label: null,
    })
    expect(r!.customerName).toMatch(/^db-test /)
    expect(r!.bikeLabel).toMatch(/^Untitled · /)  // the fixture model has no translation
    expect(JSON.stringify(r)).not.toMatch(/12300|amount|notes/i)
  })

  it('is a maintenance with its reason and no customer', async () => {
    const result = await planMaintenance({ requestKey: crypto.randomUUID(), bikeUnitId: fx.unitIds[0], startsOn: '2031-08-01', endsOn: '2031-08-04', label: 'chain' })
    if (result.status !== 'planned') throw new Error('not planned')
    expect(await getReservationForCalendar(result.reservationId)).toMatchObject({ kind: 'maintenance', label: 'chain', customerName: null })
  })

  it('still says "cancelled" for a cancelled one: the event must go, and the sync needs to know why', async () => {
    const { reservationId } = await rent('2031-07-10', '2031-07-13')
    await cancelReservation(reservationId)
    expect(await getReservationForCalendar(reservationId)).toMatchObject({ status: 'cancelled' })
  })

  it('is null for one that does not exist', async () => {
    expect(await getReservationForCalendar(crypto.randomUUID())).toBeNull()
  })
})

describe('listReservationsForCalendar', () => {
  it('lists the confirmed reservations that touch the window, not the cancelled ones nor the ones outside', async () => {
    const inside = await rent('2031-07-10', '2031-07-13')
    const cancelled = await rent('2031-07-20', '2031-07-22')
    await cancelReservation(cancelled.reservationId)
    const outside = await rent('2032-07-10', '2032-07-12')
    const ids = (await listReservationsForCalendar('2031-07-01', '2031-08-01')).map((r) => r.id)
    expect(ids).toContain(inside.reservationId)
    expect(ids).not.toContain(cancelled.reservationId)
    expect(ids).not.toContain(outside.reservationId)
  })

  it('includes one that starts before the window and ends inside it, and one that ends the day the window starts', async () => {
    const straddling = await rent('2031-06-28', '2031-07-03')
    const before = await rent('2031-06-20', '2031-07-01')
    const ids = (await listReservationsForCalendar('2031-07-01', '2031-08-01')).map((r) => r.id)
    expect(ids).toContain(straddling.reservationId)
    expect(ids).not.toContain(before.reservationId)
  })
})

describe('listReservationIdsOfCustomer', () => {
  it('lists the confirmed reservations of a customer that are not over yet', async () => {
    const future = await rent('2099-07-10', '2099-07-13')
    const cancelled = await rent('2099-08-10', '2099-08-13')
    await cancelReservation(cancelled.reservationId)
    const past = await rent('2001-07-10', '2001-07-13')
    const ids = await listReservationIdsOfCustomer(fx.customerId)
    expect(ids).toContain(future.reservationId)
    expect(ids).not.toContain(cancelled.reservationId)
    expect(ids).not.toContain(past.reservationId)
  })
})
