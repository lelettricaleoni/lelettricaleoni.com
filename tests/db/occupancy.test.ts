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
