import { and, asc, eq, gt, lt, ne, sql, type SQL } from 'drizzle-orm'
import {
  db, bikeCategories, bikeModels, bikeReservations, bikeUnits, bikeModelTranslations, bikeSizes, bikeVersions, customers,
  type BikeReservation, type Customer,
} from '@/lib/db'
import { fullName } from '@/lib/customer'
import { summarize, type CustomerSummary } from '@/lib/customers'
import { EXCLUSION_VIOLATION, FOREIGN_KEY_VIOLATION, pgErrorCode } from '@/lib/pg-errors'
import { occupying } from '@/lib/booking/occupancy'
import { daysBetween, exclusiveEnd, monthDays, type DayRange, type IsoDate, type IsoMonth } from '@/lib/dates'

/*
 * Every operation here is ONE statement: this client cannot open a transaction (max_pipeline: 0,
 * see lib/db/client-options.ts). The database has the last word on double bookings, through the
 * `bike_reservations_no_overlap` exclusion constraint; code that loses a race gets `23P01` and
 * picks again.
 */

export type ReservationKind = BikeReservation['kind']

export interface ReservationSummary {
  id: string
  bikeUnitId: string
  kind: ReservationKind
  startsOn: IsoDate
  endsOn: IsoDate
  label: string | null
}

type CustomerName = Pick<Customer, 'firstName' | 'lastName'>

/** What the calendar writes on a block: the customer's name for a rental, the reason for a maintenance. */
function caption(row: BikeReservation, customer: CustomerName | null): string | null {
  return customer ? fullName(customer.firstName, customer.lastName) : row.label
}

function summary(row: BikeReservation, customer: CustomerName | null): ReservationSummary {
  return {
    id: row.id, bikeUnitId: row.bikeUnitId, kind: row.kind,
    startsOn: row.startsOn, endsOn: row.endsOn, label: caption(row, customer),
  }
}

/** Reservations with the caption ready, earliest first. */
async function selectSummaries(where: SQL | undefined): Promise<ReservationSummary[]> {
  const rows = await db.select({ reservation: bikeReservations, customer: customers })
    .from(bikeReservations)
    .leftJoin(customers, eq(customers.id, bikeReservations.customerId))
    .where(where)
    .orderBy(asc(bikeReservations.startsOn))
  return rows.map((row) => summary(row.reservation, row.customer))
}

async function findByRequestKey(requestKey: string): Promise<BikeReservation | undefined> {
  const [row] = await db.select().from(bikeReservations).where(eq(bikeReservations.requestKey, requestKey))
  return row
}

async function findOverlaps(
  bikeUnitId: string, startsOn: IsoDate, endsOn: IsoDate, excludeId?: string,
): Promise<ReservationSummary[]> {
  return selectSummaries(and(
    eq(bikeReservations.bikeUnitId, bikeUnitId),
    occupying(),
    lt(bikeReservations.startsOn, endsOn),
    gt(bikeReservations.endsOn, startsOn),
    excludeId ? ne(bikeReservations.id, excludeId) : undefined,
  ))
}

// ---------------------------------------------------------------------------------------------
// Rentals at the counter

const MAX_ATTEMPTS = 8

export interface CreateRentalInput {
  requestKey: string
  bikeModelId: string
  bikeSizeId: string
  bikeVersionId: string
  startsOn: IsoDate
  endsOn: IsoDate
  customerId: string
  /** Book this very bike (it must be of the model, size and version asked for); otherwise any free one. */
  bikeUnitId?: string
  /** What the rental costs, in cents. */
  amountCents: number
  confirmDuplicate: boolean
}

export type CreateRentalResult =
  | { status: 'created'; reservationId: string; bikeUnitId: string; replayed: boolean }
  | { status: 'possible_duplicate'; existing: ReservationSummary }
  | { status: 'no_bike_free' }
  | { status: 'try_again' }

/**
 * The case the exclusion constraint cannot see: the same rental typed twice, with two free
 * bikes, takes two DIFFERENT bikes without any error. Same customer, same model and size,
 * overlapping days.
 */
async function findPossibleDuplicate(input: CreateRentalInput): Promise<ReservationSummary | null> {
  const rows = await db.execute<{
    id: string; bike_unit_id: string; starts_on: string; ends_on: string; first_name: string; last_name: string
  }>(sql`
    select r.id, r.bike_unit_id, r.starts_on::text as starts_on, r.ends_on::text as ends_on,
           c.first_name, c.last_name
    from bike_reservations r
    join bike_units u on u.id = r.bike_unit_id
    join customers c on c.id = r.customer_id
    where r.kind = 'counter_rental' and r.status = 'confirmed'
      and r.customer_id = ${input.customerId}::uuid
      and u.bike_model_id = ${input.bikeModelId}::uuid
      and u.bike_size_id = ${input.bikeSizeId}::uuid
      and r.starts_on < ${input.endsOn}::date and ${input.startsOn}::date < r.ends_on
    limit 1`)
  const row = rows[0]
  if (!row) return null
  return {
    id: row.id, bikeUnitId: row.bike_unit_id, kind: 'counter_rental',
    startsOn: row.starts_on, endsOn: row.ends_on, label: fullName(row.first_name, row.last_name),
  }
}

export async function createCounterRental(input: CreateRentalInput): Promise<CreateRentalResult> {
  const replay = await findByRequestKey(input.requestKey)
  if (replay) {
    return { status: 'created', reservationId: replay.id, bikeUnitId: replay.bikeUnitId, replayed: true }
  }

  if (!input.confirmDuplicate) {
    const existing = await findPossibleDuplicate(input)
    if (existing) return { status: 'possible_duplicate', existing }
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const rows = await db.execute<{ id: string; bike_unit_id: string }>(sql`
        insert into bike_reservations (bike_unit_id, kind, status, starts_on, ends_on, customer_id, amount_cents, request_key)
        select u.id, 'counter_rental'::reservation_kind, 'confirmed'::reservation_status,
               ${input.startsOn}::date, ${input.endsOn}::date, ${input.customerId}::uuid, ${input.amountCents}::int, ${input.requestKey}::uuid
        from bike_units u
        where u.bike_model_id = ${input.bikeModelId}::uuid
          and u.bike_size_id = ${input.bikeSizeId}::uuid
          and u.bike_version_id = ${input.bikeVersionId}::uuid
          and (${input.bikeUnitId ?? null}::uuid is null or u.id = ${input.bikeUnitId ?? null}::uuid)
          and (u.retired_on is null or ${input.endsOn}::date <= u.retired_on)
          and not exists (
            select 1 from bike_reservations r
            where r.bike_unit_id = u.id and r.status in ('confirmed', 'held')
              and r.during && daterange(${input.startsOn}::date, ${input.endsOn}::date, '[)'))
        order by u.created_at, u.id
        limit 1
        on conflict (request_key) do nothing
        returning id, bike_unit_id`)

      if (rows.length > 0) {
        return { status: 'created', reservationId: rows[0].id, bikeUnitId: rows[0].bike_unit_id, replayed: false }
      }
      // No row: either nobody is free, or the same key won a race against this very call.
      const raced = await findByRequestKey(input.requestKey)
      if (raced) return { status: 'created', reservationId: raced.id, bikeUnitId: raced.bikeUnitId, replayed: true }
      return { status: 'no_bike_free' }
    } catch (error) {
      // Another request took the bike this one had picked, a moment earlier: pick again.
      if (pgErrorCode(error) === EXCLUSION_VIOLATION) continue
      throw error
    }
  }
  return { status: 'try_again' }
}

export type CancelResult = { status: 'cancelled' } | { status: 'not_found' }

export async function cancelReservation(id: string): Promise<CancelResult> {
  const rows = await db.update(bikeReservations)
    .set({ status: 'cancelled' })
    .where(and(eq(bikeReservations.id, id), eq(bikeReservations.status, 'confirmed')))
    .returning({ id: bikeReservations.id })
  return rows.length > 0 ? { status: 'cancelled' } : { status: 'not_found' }
}

export type MoveResult =
  | { status: 'moved' } | { status: 'conflict' } | { status: 'not_found' } | { status: 'unknown_bike' }

export async function moveReservation(id: string, bikeUnitId: string): Promise<MoveResult> {
  try {
    const rows = await db.update(bikeReservations)
      .set({ bikeUnitId })
      .where(and(
        eq(bikeReservations.id, id),
        eq(bikeReservations.kind, 'counter_rental'),
        eq(bikeReservations.status, 'confirmed'),
      ))
      .returning({ id: bikeReservations.id })
    return rows.length > 0 ? { status: 'moved' } : { status: 'not_found' }
  } catch (error) {
    const code = pgErrorCode(error)
    if (code === EXCLUSION_VIOLATION) return { status: 'conflict' }
    if (code === FOREIGN_KEY_VIOLATION) return { status: 'unknown_bike' }
    throw error
  }
}

export interface MoveCandidate {
  bikeUnitId: string
  shortId: string
  modelName: string
  sizeName: string
  versionName: string
  sameModelAndSize: boolean
}

/** Bikes free in the days of a reservation, those of the same model and size first. */
export async function getMoveCandidates(reservationId: string): Promise<MoveCandidate[]> {
  const [current] = await db.select({
    reservation: bikeReservations, modelId: bikeUnits.bikeModelId, sizeId: bikeUnits.bikeSizeId,
  })
    .from(bikeReservations)
    .innerJoin(bikeUnits, eq(bikeUnits.id, bikeReservations.bikeUnitId))
    .where(eq(bikeReservations.id, reservationId))
  if (!current) return []

  const { reservation } = current
  const rows = await db.execute<{
    id: string; model_name: string; size_name: string; version_name: string; is_same: boolean
  }>(sql`
    select u.id, coalesce(mt.name, 'Untitled') as model_name, s.name as size_name, v.name as version_name,
           (u.bike_model_id = ${current.modelId}::uuid and u.bike_size_id = ${current.sizeId}::uuid) as is_same
    from bike_units u
    join bike_sizes s on s.id = u.bike_size_id
    join bike_versions v on v.id = u.bike_version_id
    left join bike_model_translations mt on mt.bike_model_id = u.bike_model_id and mt.locale = 'it'
    where u.id <> ${reservation.bikeUnitId}::uuid
      and (u.retired_on is null or ${reservation.endsOn}::date <= u.retired_on)
      and not exists (
        select 1 from bike_reservations r
        where r.bike_unit_id = u.id and r.status in ('confirmed', 'held')
          and r.during && daterange(${reservation.startsOn}::date, ${reservation.endsOn}::date, '[)'))
    order by is_same desc, model_name, s.display_order, v.display_order, u.id`)

  return rows.map((row) => ({
    bikeUnitId: row.id, shortId: row.id.slice(0, 8), modelName: row.model_name,
    sizeName: row.size_name, versionName: row.version_name, sameModelAndSize: row.is_same,
  }))
}

// ---------------------------------------------------------------------------------------------
// Maintenance

export interface PlanMaintenanceInput {
  requestKey: string
  bikeUnitId: string
  startsOn: IsoDate
  endsOn: IsoDate
  label: string | null
}

export type MaintenanceResult =
  | { status: 'planned'; reservationId: string; replayed: boolean }
  | { status: 'conflict'; conflicts: ReservationSummary[] }
  | { status: 'unknown_bike' }

export async function planMaintenance(input: PlanMaintenanceInput): Promise<MaintenanceResult> {
  try {
    const rows = await db.insert(bikeReservations)
      .values({
        bikeUnitId: input.bikeUnitId, kind: 'maintenance', status: 'confirmed',
        startsOn: input.startsOn, endsOn: input.endsOn, label: input.label, requestKey: input.requestKey,
      })
      .onConflictDoNothing({ target: bikeReservations.requestKey })
      .returning({ id: bikeReservations.id })
    if (rows.length > 0) return { status: 'planned', reservationId: rows[0].id, replayed: false }

    const replay = await findByRequestKey(input.requestKey)
    if (replay) return { status: 'planned', reservationId: replay.id, replayed: true }
    return { status: 'conflict', conflicts: [] }
  } catch (error) {
    const code = pgErrorCode(error)
    if (code === EXCLUSION_VIOLATION) {
      return { status: 'conflict', conflicts: await findOverlaps(input.bikeUnitId, input.startsOn, input.endsOn) }
    }
    if (code === FOREIGN_KEY_VIOLATION) return { status: 'unknown_bike' }
    throw error
  }
}

export type UpdateMaintenanceResult =
  | { status: 'updated' } | { status: 'conflict'; conflicts: ReservationSummary[] } | { status: 'not_found' }

export async function updateMaintenance(
  id: string, startsOn: IsoDate, endsOn: IsoDate,
): Promise<UpdateMaintenanceResult> {
  const [current] = await db.select().from(bikeReservations).where(and(
    eq(bikeReservations.id, id), eq(bikeReservations.kind, 'maintenance'), eq(bikeReservations.status, 'confirmed'),
  ))
  if (!current) return { status: 'not_found' }

  try {
    const rows = await db.update(bikeReservations)
      .set({ startsOn, endsOn })
      .where(and(
        eq(bikeReservations.id, id), eq(bikeReservations.kind, 'maintenance'), eq(bikeReservations.status, 'confirmed'),
      ))
      .returning({ id: bikeReservations.id })
    return rows.length > 0 ? { status: 'updated' } : { status: 'not_found' }
  } catch (error) {
    if (pgErrorCode(error) === EXCLUSION_VIOLATION) {
      return { status: 'conflict', conflicts: await findOverlaps(current.bikeUnitId, startsOn, endsOn, id) }
    }
    throw error
  }
}

/** Every confirmed range of a bike: what the maintenance picker must not let you cross. */
export async function getOccupiedRanges(bikeUnitId: string, excludeReservationId?: string): Promise<DayRange[]> {
  const rows = await db.select({ startsOn: bikeReservations.startsOn, endsOn: bikeReservations.endsOn })
    .from(bikeReservations)
    .where(and(
      eq(bikeReservations.bikeUnitId, bikeUnitId),
      occupying(),
      excludeReservationId ? ne(bikeReservations.id, excludeReservationId) : undefined,
    ))
    .orderBy(asc(bikeReservations.startsOn))
  return rows
}

export interface MaintenanceInfo { startsOn: IsoDate; endsOn: IsoDate; active: boolean }

/** The maintenance in progress or the next one for each bike, for the Shop list. */
export async function getMaintenanceByUnit(today: IsoDate): Promise<Record<string, MaintenanceInfo>> {
  const rows = await db.select({
    unitId: bikeReservations.bikeUnitId, startsOn: bikeReservations.startsOn, endsOn: bikeReservations.endsOn,
  })
    .from(bikeReservations)
    .where(and(
      eq(bikeReservations.kind, 'maintenance'),
      eq(bikeReservations.status, 'confirmed'),
      gt(bikeReservations.endsOn, today),
    ))
    .orderBy(asc(bikeReservations.startsOn))

  const result: Record<string, MaintenanceInfo> = {}
  for (const row of rows) {
    if (row.unitId in result) continue
    result[row.unitId] = { startsOn: row.startsOn, endsOn: row.endsOn, active: daysBetween(row.startsOn, today) >= 0 }
  }
  return result
}

// ---------------------------------------------------------------------------------------------
// The calendar

export interface GridReservation {
  id: string
  kind: ReservationKind
  startsOn: IsoDate
  endsOn: IsoDate
  /** The customer's name for a rental, the reason for a maintenance. */
  label: string | null
  /** Who rents, with the contacts: null for a maintenance. */
  customer: CustomerSummary | null
  /** The price of the rental in cents: null for a maintenance. */
  amountCents: number | null
  /** `held` while the person is still paying for it. */
  status: 'confirmed' | 'held'
}

export interface GridUnit {
  id: string
  shortId: string
  categoryId: string
  categoryName: string
  modelId: string
  modelName: string
  sizeId: string
  sizeName: string
  versionId: string
  versionName: string
  /** The first day the bike is no longer offered, or null while it is in service. */
  retiredOn: IsoDate | null
  reservations: GridReservation[]
}

/** Every bike with its confirmed reservations that touch the month. Two queries, no per-bike loop. */
export async function getGrid(month: IsoMonth): Promise<GridUnit[]> {
  const days = monthDays(month)
  const monthStart = days[0]
  const monthEnd = exclusiveEnd(days[days.length - 1])

  const [units, reservations] = await Promise.all([
    db.select({
      id: bikeUnits.id, categoryId: bikeCategories.id, categoryName: bikeCategories.name,
      modelId: bikeUnits.bikeModelId, modelName: bikeModelTranslations.name,
      sizeId: bikeSizes.id, sizeName: bikeSizes.name, versionId: bikeVersions.id, versionName: bikeVersions.name,
      retiredOn: bikeUnits.retiredOn,
    })
      .from(bikeUnits)
      .innerJoin(bikeModels, eq(bikeModels.id, bikeUnits.bikeModelId))
      .innerJoin(bikeCategories, eq(bikeCategories.id, bikeModels.categoryId))
      .leftJoin(bikeModelTranslations, and(
        eq(bikeModelTranslations.bikeModelId, bikeUnits.bikeModelId), eq(bikeModelTranslations.locale, 'it'),
      ))
      .innerJoin(bikeSizes, eq(bikeSizes.id, bikeUnits.bikeSizeId))
      .innerJoin(bikeVersions, eq(bikeVersions.id, bikeUnits.bikeVersionId))
      .orderBy(
        asc(bikeCategories.displayOrder), asc(bikeCategories.name), asc(bikeCategories.id),
        asc(bikeModelTranslations.name), asc(bikeUnits.bikeModelId),
        asc(bikeSizes.displayOrder), asc(bikeVersions.displayOrder),
        asc(bikeUnits.createdAt), asc(bikeUnits.id),
      ),
    db.select({ reservation: bikeReservations, customer: customers })
      .from(bikeReservations)
      .leftJoin(customers, eq(customers.id, bikeReservations.customerId))
      .where(and(
        occupying(),
        lt(bikeReservations.startsOn, monthEnd),
        gt(bikeReservations.endsOn, monthStart),
      )),
  ])

  const byUnit = new Map<string, GridReservation[]>()
  for (const { reservation: row, customer } of reservations) {
    const list = byUnit.get(row.bikeUnitId) ?? []
    list.push({
      id: row.id, kind: row.kind, startsOn: row.startsOn, endsOn: row.endsOn,
      label: caption(row, customer), customer: customer ? summarize(customer) : null, amountCents: row.amountCents,
      status: row.status === 'held' ? 'held' : 'confirmed',
    })
    byUnit.set(row.bikeUnitId, list)
  }

  // A bike retired on or before the first day of the month has nothing to show in it, unless it
  // was still booked then: the history is never hidden.
  return units
    .filter((unit) => !unit.retiredOn || daysBetween(monthStart, unit.retiredOn) > 0 || byUnit.has(unit.id))
    .map((unit) => ({
      id: unit.id,
      shortId: unit.id.slice(0, 8),
      categoryId: unit.categoryId,
      categoryName: unit.categoryName,
      modelId: unit.modelId,
      modelName: unit.modelName ?? 'Untitled',
      sizeId: unit.sizeId,
      sizeName: unit.sizeName,
      versionId: unit.versionId,
      versionName: unit.versionName,
      retiredOn: unit.retiredOn,
      reservations: byUnit.get(unit.id) ?? [],
    }))
}

// ---------------------------------------------------------------------------------------------
// Retiring a bike

export type RetireResult =
  | { status: 'retired' } | { status: 'conflict'; conflicts: ReservationSummary[] } | { status: 'not_found' }

/**
 * From `retiredOn` the bike is not offered any more. Refused, with the list, while it has a
 * confirmed reservation that reaches that day or later: those are moved first, never cancelled
 * behind Kevin's back. ONE statement, so the check and the update cannot be separated.
 */
export async function retireBikeUnit(id: string, retiredOn: IsoDate): Promise<RetireResult> {
  const rows = await db.execute<{ id: string }>(sql`
    update bike_units u set retired_on = ${retiredOn}::date
    where u.id = ${id}::uuid
      and not exists (
        select 1 from bike_reservations r
        where r.bike_unit_id = u.id and r.status in ('confirmed', 'held') and r.ends_on > ${retiredOn}::date)
    returning u.id`)
  if (rows.length > 0) return { status: 'retired' }

  const [unit] = await db.select({ id: bikeUnits.id }).from(bikeUnits).where(eq(bikeUnits.id, id))
  if (!unit) return { status: 'not_found' }

  const conflicts = await selectSummaries(and(
    eq(bikeReservations.bikeUnitId, id),
    occupying(),
    gt(bikeReservations.endsOn, retiredOn),
  ))
  return { status: 'conflict', conflicts }
}

export type RestoreResult = { status: 'restored' } | { status: 'not_found' }

export async function restoreBikeUnit(id: string): Promise<RestoreResult> {
  const rows = await db.update(bikeUnits).set({ retiredOn: null }).where(eq(bikeUnits.id, id)).returning({ id: bikeUnits.id })
  return rows.length > 0 ? { status: 'restored' } : { status: 'not_found' }
}

// ---------------------------------------------------------------------------------------------
// Removing a bike from the shop

export type DeleteBikeResult = { status: 'deleted' } | { status: 'has_reservations' }

/** A bike with any reservation, cancelled ones included, is not deleted: the history keeps pointing at it. */
export async function deleteBikeUnitUnlessReserved(id: string): Promise<DeleteBikeResult> {
  try {
    await db.delete(bikeUnits).where(eq(bikeUnits.id, id))
    return { status: 'deleted' }
  } catch (error) {
    if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) return { status: 'has_reservations' }
    throw error
  }
}
