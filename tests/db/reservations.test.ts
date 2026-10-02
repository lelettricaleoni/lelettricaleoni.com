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
      created(await createCounterRental(rental(single, { label: 'A' })))
      const planned = await plan(single.unitIds[0], '2031-08-01', '2031-08-05')
      if (planned.status !== 'planned') throw new Error('expected planned')
      expect(await getOccupiedRanges(single.unitIds[0])).toHaveLength(2)
      expect(await getOccupiedRanges(single.unitIds[0], planned.reservationId)).toEqual([RANGE])
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
