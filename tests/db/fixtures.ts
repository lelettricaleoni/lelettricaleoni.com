import { eq, inArray, sql } from 'drizzle-orm'
import {
  db, bikeCategories, customers, bikeModels, bikeSizes, bikeVersions, bikeUnits, bikeReservations, bookings,
  type NewBikeReservation,
} from '@/lib/db'
import type { DayRange } from '@/lib/dates'

export interface Fixture {
  modelId: string
  sizeId: string
  versionId: string
  unitIds: string[]
  /** A customer for the rentals of the test. */
  customerId: string
  cleanup: () => Promise<void>
}

/** A category, a model, a size, a version and `unitCount` bikes, all of them removed by `cleanup`. */
export async function createFixture(unitCount: number): Promise<Fixture> {
  const tag = `db-test-${crypto.randomUUID()}`
  const [category] = await db.insert(bikeCategories)
    .values({ name: tag, maxRentalDays: 7, day1Price: '10' }).returning()
  const [model] = await db.insert(bikeModels).values({ categoryId: category.id }).returning()
  const [size] = await db.insert(bikeSizes).values({ name: tag }).returning()
  const [version] = await db.insert(bikeVersions).values({ name: tag }).returning()
  const units = unitCount > 0
    ? await db.insert(bikeUnits).values(
      Array.from({ length: unitCount }, () => ({
        bikeModelId: model.id, bikeSizeId: size.id, bikeVersionId: version.id,
      })),
    ).returning()
    : []
  const unitIds = units.map((unit) => unit.id)
  const [customer] = await db.insert(customers).values({ firstName: 'db-test', lastName: tag }).returning()

  return {
    modelId: model.id,
    sizeId: size.id,
    versionId: version.id,
    unitIds,
    customerId: customer.id,
    cleanup: async () => {
      if (unitIds.length > 0) {
        await db.delete(bikeReservations).where(inArray(bikeReservations.bikeUnitId, unitIds))
        await db.delete(bikeUnits).where(inArray(bikeUnits.id, unitIds))
      }
      await db.delete(bikeReservations).where(eq(bikeReservations.customerId, customer.id))
      await db.delete(bookings).where(eq(bookings.customerId, customer.id))
      await db.delete(customers).where(eq(customers.id, customer.id))
      await db.delete(bikeModels).where(eq(bikeModels.id, model.id))
      await db.delete(bikeSizes).where(eq(bikeSizes.id, size.id))
      await db.delete(bikeVersions).where(eq(bikeVersions.id, version.id))
      await db.delete(bikeCategories).where(eq(bikeCategories.id, category.id))
    },
  }
}

/** Insert values for a reservation (a maintenance unless told otherwise), with a fresh idempotency key. */
export function reservationValues(
  bikeUnitId: string, startsOn: string, endsOn: string, overrides: Partial<NewBikeReservation> = {},
): NewBikeReservation {
  return {
    bikeUnitId, kind: 'maintenance', status: 'confirmed', startsOn, endsOn,
    requestKey: crypto.randomUUID(), ...overrides,
  }
}

export type LineStatus = 'held' | 'confirmed' | 'expired' | 'cancelled'

/** A booking of `customerId` for the range; pending, holding for 30 minutes, unless told otherwise. */
export async function insertBooking(
  customerId: string,
  range: DayRange,
  options: {
    status?: 'pending' | 'confirmed' | 'expired' | 'cancelled'; holdMinutes?: number; createdMinutesAgo?: number
    lineCount?: number; requestKey?: string
  } = {},
): Promise<string> {
  const [row] = await db.insert(bookings).values({
    customerId,
    requestKey: options.requestKey ?? crypto.randomUUID(),
    status: options.status ?? 'pending',
    ...(options.lineCount === undefined ? {} : { lineCount: options.lineCount }),
    startsOn: range.startsOn,
    endsOn: range.endsOn,
    totalCents: 4500,
    holdExpiresAt: sql`now() + make_interval(mins => ${options.holdMinutes ?? 30})`,
    createdAt: sql`now() - make_interval(mins => ${options.createdMinutesAgo ?? 0})`,
  }).returning({ id: bookings.id })
  return row.id
}

/** One bike of an online booking, in the given state. */
export async function insertOnlineLine(
  bookingId: string, customerId: string, bikeUnitId: string, range: DayRange, status: LineStatus,
): Promise<string> {
  const [row] = await db.insert(bikeReservations).values({
    bikeUnitId, kind: 'online_rental', status, startsOn: range.startsOn, endsOn: range.endsOn,
    customerId, bookingId, amountCents: 4500, requestKey: crypto.randomUUID(),
  }).returning({ id: bikeReservations.id })
  return row.id
}
