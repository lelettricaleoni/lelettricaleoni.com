import { and, asc, eq, gt, isNull, lt, or } from 'drizzle-orm'
import { db, bikeModels, bikeReservations, bikeUnits } from '@/lib/db'
import type { DayRange } from '@/lib/dates'
import { mergeRanges, type UnitBusy } from './day-availability'
import { occupying } from './occupancy'
import { settleHoldsQuietly } from './catalog'

/**
 * Every bike of a published model (or of one `modelId`) with the periods it is taken inside `window`, the busy ones merged: what the
 * picker needs to grey out days in the browser. A bike taken by a `confirmed` or a `held` reservation is busy (`occupying()`), a bike
 * retired before the window is left out. One statement, so the picture is a single moment; read on every request, never cached
 * (a booking just made has to show).
 */
export async function getUnitBusyIntervals(options: { modelId?: string; window: DayRange }): Promise<UnitBusy[]> {
  await settleHoldsQuietly()
  const { modelId, window } = options
  const rows = await db
    .select({
      unitId: bikeUnits.id,
      modelId: bikeUnits.bikeModelId,
      sizeId: bikeUnits.bikeSizeId,
      versionId: bikeUnits.bikeVersionId,
      retiredOn: bikeUnits.retiredOn,
      startsOn: bikeReservations.startsOn,
      endsOn: bikeReservations.endsOn,
    })
    .from(bikeUnits)
    .innerJoin(bikeModels, eq(bikeModels.id, bikeUnits.bikeModelId))
    .leftJoin(
      bikeReservations,
      and(
        eq(bikeReservations.bikeUnitId, bikeUnits.id),
        occupying(),
        lt(bikeReservations.startsOn, window.endsOn),
        gt(bikeReservations.endsOn, window.startsOn),
      ),
    )
    .where(and(
      eq(bikeModels.isPublished, true),
      modelId ? eq(bikeUnits.bikeModelId, modelId) : undefined,
      or(isNull(bikeUnits.retiredOn), gt(bikeUnits.retiredOn, window.startsOn)),
    ))
    .orderBy(asc(bikeUnits.createdAt), asc(bikeUnits.id))

  const units = new Map<string, UnitBusy & { raw: DayRange[] }>()
  for (const row of rows) {
    const unit = units.get(row.unitId) ?? {
      unitId: row.unitId, modelId: row.modelId, sizeId: row.sizeId, versionId: row.versionId, retiredOn: row.retiredOn, busy: [], raw: [],
    }
    if (row.startsOn !== null && row.endsOn !== null) unit.raw.push({ startsOn: row.startsOn, endsOn: row.endsOn })
    units.set(row.unitId, unit)
  }
  return [...units.values()].map(({ raw, ...unit }) => ({ ...unit, busy: mergeRanges(raw) }))
}
