import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, bikeReservations } from '@/lib/db'
import { getCustomerDetail } from '@/lib/customers'
import { createFixture, insertBooking, insertOnlineLine, reservationValues, type Fixture } from './fixtures'

const RANGE = { startsOn: '2032-01-12', endsOn: '2032-01-15' }

/**
 * A customer's history in the panel is made of the rentals that happened. A bike held for somebody who is still paying is not one
 * yet, and one that expired never was: they must not appear in the history nor in the takings.
 */
describe('the history of a customer with an online booking in progress', () => {
  let fx: Fixture
  beforeEach(async () => { fx = await createFixture(2) })
  afterEach(async () => { await fx.cleanup() })

  it('does not list or count a held or an expired online bike', async () => {
    const held = await insertBooking(fx.customerId, RANGE)
    await insertOnlineLine(held, fx.customerId, fx.unitIds[0], RANGE, 'held')
    const expired = await insertBooking(fx.customerId, { startsOn: '2032-03-01', endsOn: '2032-03-04' }, { status: 'expired' })
    await insertOnlineLine(expired, fx.customerId, fx.unitIds[1], { startsOn: '2032-03-01', endsOn: '2032-03-04' }, 'expired')

    const detail = await getCustomerDetail(fx.customerId)
    expect(detail?.rentals).toEqual([])
    expect(detail?.stats).toMatchObject({ rentals: 0, revenueCents: 0, firstRentalOn: null })
  })

  it('still lists the rentals made at the counter, with their status', async () => {
    await db.insert(bikeReservations).values(reservationValues(fx.unitIds[0], RANGE.startsOn, RANGE.endsOn, {
      kind: 'counter_rental', customerId: fx.customerId, amountCents: 3000,
    }))
    const detail = await getCustomerDetail(fx.customerId)
    expect(detail?.rentals).toHaveLength(1)
    expect(detail?.rentals[0]).toMatchObject({ status: 'confirmed', amountCents: 3000 })
    expect(detail?.stats.rentals).toBe(1)
  })
})
