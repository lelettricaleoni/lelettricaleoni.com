import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { and, eq, inArray } from 'drizzle-orm'
import { db, bikeUnits } from '@/lib/db'
import { inGarage } from '@/lib/in-garage'
import { addDaysTo, todayInRome } from '@/lib/dates'
import { createFixture, type Fixture } from './fixtures'

describe('inGarage: which bikes the public site counts', () => {
  let fx: Fixture
  beforeEach(async () => { fx = await createFixture(4) })
  afterEach(async () => { await fx.cleanup() })

  async function visible() {
    const rows = await db.select({ id: bikeUnits.id }).from(bikeUnits)
      .where(and(inArray(bikeUnits.id, fx.unitIds), inGarage()))
    return rows.map((row) => row.id)
  }

  const retire = (unitId: string, day: string | null) =>
    db.update(bikeUnits).set({ retiredOn: day }).where(eq(bikeUnits.id, unitId))

  it('counts a bike that was never retired, and one retired from tomorrow on', async () => {
    const today = todayInRome()
    await retire(fx.unitIds[1], addDaysTo(today, 1))
    expect((await visible()).sort()).toEqual([fx.unitIds[0], fx.unitIds[1], fx.unitIds[2], fx.unitIds[3]].sort())
  })

  it('stops counting a bike on the day it is retired, and after it', async () => {
    const today = todayInRome()
    await retire(fx.unitIds[0], today)
    await retire(fx.unitIds[1], addDaysTo(today, -30))
    expect((await visible()).sort()).toEqual([fx.unitIds[2], fx.unitIds[3]].sort())
  })

  it('counts a bike again once it is restored', async () => {
    await retire(fx.unitIds[0], addDaysTo(todayInRome(), -1))
    expect(await visible()).not.toContain(fx.unitIds[0])
    await retire(fx.unitIds[0], null)
    expect(await visible()).toContain(fx.unitIds[0])
  })
})
