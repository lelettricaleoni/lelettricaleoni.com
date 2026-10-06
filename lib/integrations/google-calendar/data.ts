import 'server-only'
import { and, eq, gt, lt } from 'drizzle-orm'
import {
  db, bikeModelTranslations, bikeReservations, bikeSizes, bikeUnits, bikeVersions, customers,
} from '@/lib/db'
import { fullName } from '@/lib/customer'
import { todayInRome, type IsoDate } from '@/lib/dates'
import type { ReservationForCalendar } from '@/lib/integrations/google-calendar/events'

/*
 * Reads reservations in the shape the calendar needs. It selects ONLY what an event may contain: the amount and the
 * private notes of a customer are never read here, so they cannot be sent by mistake.
 */

const columns = {
  id: bikeReservations.id,
  kind: bikeReservations.kind,
  status: bikeReservations.status,
  startsOn: bikeReservations.startsOn,
  endsOn: bikeReservations.endsOn,
  label: bikeReservations.label,
  unitId: bikeUnits.id,
  modelName: bikeModelTranslations.name,
  sizeName: bikeSizes.name,
  versionName: bikeVersions.name,
  firstName: customers.firstName,
  lastName: customers.lastName,
  phone: customers.phone,
}

function select() {
  return db.select(columns)
    .from(bikeReservations)
    .innerJoin(bikeUnits, eq(bikeUnits.id, bikeReservations.bikeUnitId))
    .leftJoin(bikeModelTranslations, and(eq(bikeModelTranslations.bikeModelId, bikeUnits.bikeModelId), eq(bikeModelTranslations.locale, 'it')))
    .innerJoin(bikeSizes, eq(bikeSizes.id, bikeUnits.bikeSizeId))
    .innerJoin(bikeVersions, eq(bikeVersions.id, bikeUnits.bikeVersionId))
    .leftJoin(customers, eq(customers.id, bikeReservations.customerId))
}

type Row = Awaited<ReturnType<ReturnType<typeof select>['limit']>>[number]

function toReservation(row: Row): ReservationForCalendar {
  return {
    id: row.id, kind: row.kind, status: row.status, startsOn: row.startsOn, endsOn: row.endsOn,
    bikeLabel: [row.modelName ?? 'Untitled', row.sizeName, row.versionName].join(' · '),
    shortId: row.unitId.slice(0, 8),
    customerName: row.firstName === null ? null : fullName(row.firstName, row.lastName) || null,
    customerPhone: row.phone,
    label: row.label,
  }
}

/** Null when the reservation is not in the database (any more). A cancelled one is still returned: its event must go. */
export async function getReservationForCalendar(id: string): Promise<ReservationForCalendar | null> {
  const [row] = await select().where(eq(bikeReservations.id, id)).limit(1)
  return row ? toReservation(row) : null
}

/** The confirmed reservations that touch [from, to): what the calendar must show. */
export async function listReservationsForCalendar(from: IsoDate, to: IsoDate): Promise<ReservationForCalendar[]> {
  const rows = await select().where(and(
    eq(bikeReservations.status, 'confirmed'),
    lt(bikeReservations.startsOn, to),
    gt(bikeReservations.endsOn, from),
  )).limit(5000)
  return rows.map(toReservation)
}

/** A customer's confirmed reservations that are not over: their events show the name and phone, so they follow an edit. */
export async function listReservationIdsOfCustomer(customerId: string): Promise<string[]> {
  const rows = await db.select({ id: bikeReservations.id }).from(bikeReservations).where(and(
    eq(bikeReservations.customerId, customerId),
    eq(bikeReservations.status, 'confirmed'),
    gt(bikeReservations.endsOn, todayInRome()),
  ))
  return rows.map((row) => row.id)
}
