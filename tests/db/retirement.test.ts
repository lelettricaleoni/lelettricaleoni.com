import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, bikeUnits } from '@/lib/db'
import {
  cancelReservation, createCounterRental, getGrid, getMoveCandidates, restoreBikeUnit, retireBikeUnit,
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

const retiredOnOf = async (unitId: string) =>
  (await db.select({ retiredOn: bikeUnits.retiredOn }).from(bikeUnits).where(eq(bikeUnits.id, unitId)))[0].retiredOn

describe('a retired bike is no longer offered', () => {
  let fx: Fixture
  beforeEach(async () => { fx = await createFixture(2) })
  afterEach(async () => { await fx.cleanup() })

  it('is never assigned to a rental that reaches its retirement day', async () => {
    expect(await retireBikeUnit(fx.unitIds[0], '2031-07-01')).toEqual({ status: 'retired' })
    const first = created(await createCounterRental(rental(fx, { label: 'A' })))
    expect(first.bikeUnitId).toBe(fx.unitIds[1])
    expect((await createCounterRental(rental(fx, { label: 'B' }))).status).toBe('no_bike_free')
  })

  it('is still offered for rentals that end on or before the retirement day', async () => {
    await retireBikeUnit(fx.unitIds[0], '2031-07-13')
    created(await createCounterRental(rental(fx, { label: 'A' })))
    const second = created(await createCounterRental(rental(fx, { label: 'B' })))
    // both bikes are used: the retired one is fine for a rental whose last day is the 12th
    expect(new Set([second.bikeUnitId]).size).toBe(1)
    expect((await createCounterRental(rental(fx, { label: 'C' }))).status).toBe('no_bike_free')
  })

  it('is not offered for a rental that runs one day past the retirement day', async () => {
    await retireBikeUnit(fx.unitIds[0], '2031-07-12')
    await retireBikeUnit(fx.unitIds[1], '2031-07-12')
    expect((await createCounterRental(rental(fx))).status).toBe('no_bike_free')
  })

  it('is not offered as a place to move a rental to', async () => {
    const { reservationId, bikeUnitId } = created(await createCounterRental(rental(fx)))
    const other = fx.unitIds.find((id) => id !== bikeUnitId)!
    await retireBikeUnit(other, '2031-07-01')
    const candidates = await getMoveCandidates(reservationId)
    expect(candidates.some((c) => c.bikeUnitId === other)).toBe(false)
  })

  it('can be restored, and is then offered again', async () => {
    await retireBikeUnit(fx.unitIds[0], '2031-07-01')
    await retireBikeUnit(fx.unitIds[1], '2031-07-01')
    expect((await createCounterRental(rental(fx))).status).toBe('no_bike_free')
    expect(await restoreBikeUnit(fx.unitIds[0])).toEqual({ status: 'restored' })
    expect(await retiredOnOf(fx.unitIds[0])).toBeNull()
    expect((await createCounterRental(rental(fx))).status).toBe('created')
  })
})

describe('retireBikeUnit', () => {
  let fx: Fixture
  beforeEach(async () => { fx = await createFixture(1) })
  afterEach(async () => { await fx.cleanup() })

  it('stores the day', async () => {
    expect(await retireBikeUnit(fx.unitIds[0], '2031-10-15')).toEqual({ status: 'retired' })
    expect(await retiredOnOf(fx.unitIds[0])).toBe('2031-10-15')
  })

  it('refuses while the bike has a rental on or after that day, and lists it', async () => {
    created(await createCounterRental(rental(fx, { label: 'Rossi' })))
    const result = await retireBikeUnit(fx.unitIds[0], '2031-07-11')
    expect(result.status).toBe('conflict')
    if (result.status === 'conflict') {
      expect(result.conflicts).toHaveLength(1)
      expect(result.conflicts[0]).toMatchObject({ label: 'Rossi', startsOn: '2031-07-10', endsOn: '2031-07-13' })
    }
    expect(await retiredOnOf(fx.unitIds[0])).toBeNull()
  })

  it('allows retiring on the day after the last rental day', async () => {
    created(await createCounterRental(rental(fx)))
    expect(await retireBikeUnit(fx.unitIds[0], '2031-07-13')).toEqual({ status: 'retired' })
  })

  it('does not count cancelled rentals', async () => {
    const { reservationId } = created(await createCounterRental(rental(fx)))
    await cancelReservation(reservationId)
    expect(await retireBikeUnit(fx.unitIds[0], '2031-07-01')).toEqual({ status: 'retired' })
  })

  it('answers not_found for a bike that does not exist, for retiring and restoring', async () => {
    expect(await retireBikeUnit(crypto.randomUUID(), '2031-07-01')).toEqual({ status: 'not_found' })
    expect(await restoreBikeUnit(crypto.randomUUID())).toEqual({ status: 'not_found' })
  })

  it('can change the retirement day of a bike already retired', async () => {
    await retireBikeUnit(fx.unitIds[0], '2031-07-01')
    expect(await retireBikeUnit(fx.unitIds[0], '2031-12-31')).toEqual({ status: 'retired' })
    expect(await retiredOnOf(fx.unitIds[0])).toBe('2031-12-31')
  })
})

describe('getGrid and retired bikes', () => {
  let fx: Fixture
  beforeEach(async () => { fx = await createFixture(1) })
  afterEach(async () => { await fx.cleanup() })

  const find = async (month: string) => (await getGrid(month)).find((u) => u.id === fx.unitIds[0])

  it('hides a bike retired before the month, when it had no reservation in it', async () => {
    await retireBikeUnit(fx.unitIds[0], '2031-06-15')
    expect(await find('2031-08')).toBeUndefined()
  })

  it('keeps showing it in the months where it has reservations', async () => {
    created(await createCounterRental(rental(fx)))
    await retireBikeUnit(fx.unitIds[0], '2031-07-13')
    expect(await find('2031-07')).toBeDefined()
    expect(await find('2031-08')).toBeUndefined()
  })

  it('shows it in the month it is retired in, and before, and says when', async () => {
    await retireBikeUnit(fx.unitIds[0], '2031-07-20')
    expect((await find('2031-07'))?.retiredOn).toBe('2031-07-20')
    expect((await find('2031-06'))?.retiredOn).toBe('2031-07-20')
  })

  it('hides it when it is retired on the first day of the month, with nothing booked', async () => {
    await retireBikeUnit(fx.unitIds[0], '2031-07-01')
    expect(await find('2031-07')).toBeUndefined()
  })

  it('shows a bike that is not retired with no retirement day', async () => {
    expect((await find('2031-07'))?.retiredOn).toBeNull()
  })
})
