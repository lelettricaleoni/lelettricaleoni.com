import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, bikeModels, bikeReservations, bikeUnits } from '@/lib/db'
import { getUnitBusyIntervals } from '@/lib/booking/busy-intervals'
import { createFixture, insertBooking, insertOnlineLine, reservationValues, type Fixture } from './fixtures'

const WINDOW = { startsOn: '2031-11-01', endsOn: '2032-05-01' }

describe('getUnitBusyIntervals', () => {
  let fx: Fixture
  beforeEach(async () => {
    fx = await createFixture(2)
    await db.update(bikeModels).set({ isPublished: true }).where(eq(bikeModels.id, fx.modelId))
  })
  afterEach(async () => { await fx.cleanup() })

  const mine = async (options: { modelId?: string } = { modelId: fx.modelId }) =>
    (await getUnitBusyIntervals({ ...options, window: WINDOW })).filter((unit) => unit.modelId === fx.modelId)

  it('lists every bike of a published model, free ones with no busy period', async () => {
    const units = await mine()
    expect(units.map((u) => u.unitId).sort()).toEqual([...fx.unitIds].sort())
    expect(units.every((u) => u.busy.length === 0 && u.retiredOn === null)).toBe(true)
    expect(units[0]).toMatchObject({ sizeId: fx.sizeId, versionId: fx.versionId })
  })

  it('held and confirmed reservations take the bike; expired and cancelled do not', async () => {
    const booking = await insertBooking(fx.customerId, { startsOn: '2031-11-03', endsOn: '2031-11-06' })
    await insertOnlineLine(booking, fx.customerId, fx.unitIds[0], { startsOn: '2031-11-03', endsOn: '2031-11-06' }, 'held')
    await insertOnlineLine(booking, fx.customerId, fx.unitIds[1], { startsOn: '2031-11-03', endsOn: '2031-11-06' }, 'expired')
    const units = await mine()
    expect(units.find((u) => u.unitId === fx.unitIds[0])?.busy).toEqual([{ startsOn: '2031-11-03', endsOn: '2031-11-06' }])
    expect(units.find((u) => u.unitId === fx.unitIds[1])?.busy).toEqual([])
  })

  it('joins periods that touch into one, and keeps the others apart', async () => {
    await db.insert(bikeReservations).values([
      reservationValues(fx.unitIds[0], '2031-11-03', '2031-11-05'),
      reservationValues(fx.unitIds[0], '2031-11-05', '2031-11-07'),
      reservationValues(fx.unitIds[0], '2031-11-10', '2031-11-12'),
    ])
    const busy = (await mine()).find((u) => u.unitId === fx.unitIds[0])?.busy
    expect(busy).toEqual([
      { startsOn: '2031-11-03', endsOn: '2031-11-07' },
      { startsOn: '2031-11-10', endsOn: '2031-11-12' },
    ])
  })

  it('leaves out periods outside the window', async () => {
    await db.insert(bikeReservations).values(reservationValues(fx.unitIds[0], '2030-01-01', '2030-01-05'))
    expect((await mine()).find((u) => u.unitId === fx.unitIds[0])?.busy).toEqual([])
  })

  it('reports the day a bike is retired, and drops a bike retired before the window', async () => {
    await db.update(bikeUnits).set({ retiredOn: '2031-12-01' }).where(eq(bikeUnits.id, fx.unitIds[0]))
    await db.update(bikeUnits).set({ retiredOn: '2031-10-01' }).where(eq(bikeUnits.id, fx.unitIds[1]))
    const units = await mine()
    expect(units.map((u) => u.unitId)).toEqual([fx.unitIds[0]])
    expect(units[0].retiredOn).toBe('2031-12-01')
  })

  it('leaves out the bikes of a model that is not published', async () => {
    await db.update(bikeModels).set({ isPublished: false }).where(eq(bikeModels.id, fx.modelId))
    expect(await mine()).toEqual([])
  })

  it('with a model, returns only its bikes', async () => {
    const all = await getUnitBusyIntervals({ window: WINDOW })
    const only = await getUnitBusyIntervals({ modelId: fx.modelId, window: WINDOW })
    expect(only.every((u) => u.modelId === fx.modelId)).toBe(true)
    expect(all.length).toBeGreaterThanOrEqual(only.length)
  })
})
