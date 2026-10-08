import { and, desc, eq, ilike, ne, or, sql, type SQL } from 'drizzle-orm'
import {
  db, bikeModelTranslations, bikeReservations, bikeSizes, bikeUnits, bikeVersions, customers, type Customer,
} from '@/lib/db'
import type { CustomerInput } from '@/lib/customer'
import { UNIQUE_VIOLATION, pgErrorCode } from '@/lib/pg-errors'
import type { IsoDate } from '@/lib/dates'

/*
 * The directory of the people who rent. The same email is the same person (a unique index in the database); a name
 * alone is not, and neither is a phone number, which a couple or a family shares: two Mario Rossi, or two people with the
 * same number, are two customers.
 */

export interface CustomerSummary {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  notes: string | null
}

export function summarize(row: Customer): CustomerSummary {
  return {
    id: row.id, firstName: row.firstName, lastName: row.lastName,
    email: row.email, phone: row.phone, notes: row.notes,
  }
}

export type CreateCustomerResult =
  | { status: 'created'; customer: CustomerSummary }
  | { status: 'exists'; customer: CustomerSummary }

/** One statement: a unique index decides, so two people saving the same email at once cannot both win. */
export async function createCustomer(input: CustomerInput): Promise<CreateCustomerResult> {
  const inserted = await db.insert(customers)
    .values({
      firstName: input.firstName, lastName: input.lastName,
      email: input.email ?? null, phone: input.phone ?? null, notes: input.notes ?? null,
    })
    .onConflictDoNothing()
    .returning()
  if (inserted.length > 0) return { status: 'created', customer: summarize(inserted[0]) }

  // Only an email can collide; without one there is nothing to look for (and a `where` with
  // nothing in it would return an arbitrary customer).
  if (!input.email) throw new Error('Customer not created for an unknown reason')
  const [existing] = await db.select().from(customers).where(eq(customers.email, input.email))
  // Not found means the conflict was on something this call does not control; say so loudly.
  if (!existing) throw new Error('Customer not created and no existing customer found')
  return { status: 'exists', customer: summarize(existing) }
}

const SEARCH_LIMIT = 8

/** `%` and `_` in what a person types are characters, not wildcards. */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, '\\$&')
}

/**
 * Every word must appear in the first name, the last name, the email or the phone, so "mario ros"
 * and "ros mario" both find Mario Rossi and "347 987" finds a number typed with a space.
 */
function searchWhere(query: string): SQL | undefined {
  const words = query.split(/\s+/).filter(Boolean)
  if (words.length === 0) return undefined
  return and(...words.map((word) => {
    const pattern = `%${escapeLike(word)}%`
    return or(
      ilike(customers.firstName, pattern), ilike(customers.lastName, pattern),
      ilike(customers.email, pattern), ilike(customers.phone, pattern),
    )
  }))
}

export async function searchCustomers(query: string): Promise<CustomerSummary[]> {
  const where = searchWhere(query)
  if (!where) return []

  const rows = await db.select().from(customers)
    .where(where)
    .orderBy(customers.lastName, customers.firstName, desc(customers.createdAt))
    .limit(SEARCH_LIMIT)
  return rows.map(summarize)
}

// ---------------------------------------------------------------------------------------------
// The Customers page of the panel

const counted = sql`${bikeReservations.status} = 'confirmed' and ${bikeReservations.kind} = 'counter_rental'`

export interface CustomerListItem extends CustomerSummary {
  /** Confirmed rentals: a cancelled one is not a rental. */
  rentals: number
  /** What those rentals were paid, in cents. */
  revenueCents: number
  lastRentalOn: IsoDate | null
}

const LIST_LIMIT = 200

/** Every customer (or those matching the search) with how many times they rented and what they spent. */
export async function listCustomers({ query = '' }: { query?: string } = {}): Promise<CustomerListItem[]> {
  const rows = await db.select({
    customer: customers,
    rentals: sql<number>`(count(${bikeReservations.id}) filter (where ${counted}))::int`,
    revenueCents: sql<number>`coalesce(sum(${bikeReservations.amountCents}) filter (where ${counted}), 0)::int`,
    lastRentalOn: sql<string | null>`(max(${bikeReservations.startsOn}) filter (where ${counted}))::text`,
  })
    .from(customers)
    .leftJoin(bikeReservations, eq(bikeReservations.customerId, customers.id))
    .where(searchWhere(query))
    .groupBy(customers.id)
    .orderBy(customers.lastName, customers.firstName)
    .limit(LIST_LIMIT)
  return rows.map((row) => ({
    ...summarize(row.customer), rentals: row.rentals, revenueCents: row.revenueCents, lastRentalOn: row.lastRentalOn,
  }))
}

export interface CustomerRental {
  id: string
  startsOn: IsoDate
  /** Exclusive: the day the bike came back is the day before. */
  endsOn: IsoDate
  status: 'confirmed' | 'cancelled'
  amountCents: number | null
  /** "Model · size · version · short id" */
  bike: string
}

export interface CustomerDetail {
  customer: CustomerSummary
  stats: { rentals: number; revenueCents: number; firstRentalOn: IsoDate | null; lastRentalOn: IsoDate | null }
  /** Newest first; cancelled ones are listed but not counted in the stats. */
  rentals: CustomerRental[]
}

export async function getCustomerDetail(id: string): Promise<CustomerDetail | null> {
  const [customer] = await db.select().from(customers).where(eq(customers.id, id))
  if (!customer) return null

  const rows = await db.select({
    reservation: bikeReservations, unitId: bikeUnits.id, modelName: bikeModelTranslations.name,
    sizeName: bikeSizes.name, versionName: bikeVersions.name,
  })
    .from(bikeReservations)
    .innerJoin(bikeUnits, eq(bikeUnits.id, bikeReservations.bikeUnitId))
    .leftJoin(bikeModelTranslations, and(
      eq(bikeModelTranslations.bikeModelId, bikeUnits.bikeModelId), eq(bikeModelTranslations.locale, 'it'),
    ))
    .innerJoin(bikeSizes, eq(bikeSizes.id, bikeUnits.bikeSizeId))
    .innerJoin(bikeVersions, eq(bikeVersions.id, bikeUnits.bikeVersionId))
    .where(and(eq(bikeReservations.customerId, id), eq(bikeReservations.kind, 'counter_rental')))
    .orderBy(desc(bikeReservations.startsOn), desc(bikeReservations.createdAt))

  // A counter rental is `confirmed` or `cancelled`. `held` and `expired` belong to online bookings (a bike kept for somebody who
  // is still paying, or never paid for) and are not a rental: they are left out of the history, whatever the kind.
  const rentals: CustomerRental[] = rows.flatMap((row) => {
    const status = row.reservation.status
    if (status !== 'confirmed' && status !== 'cancelled') return []
    return [{
      id: row.reservation.id, startsOn: row.reservation.startsOn, endsOn: row.reservation.endsOn,
      status, amountCents: row.reservation.amountCents,
      bike: [row.modelName ?? 'Untitled', row.sizeName, row.versionName, row.unitId.slice(0, 8)].join(' · '),
    }]
  })
  const counted = rentals.filter((rental) => rental.status === 'confirmed')
  const days = counted.map((rental) => rental.startsOn).sort()
  return {
    customer: summarize(customer),
    stats: {
      rentals: counted.length,
      revenueCents: counted.reduce((sum, rental) => sum + (rental.amountCents ?? 0), 0),
      firstRentalOn: days[0] ?? null,
      lastRentalOn: days[days.length - 1] ?? null,
    },
    rentals,
  }
}

export type UpdateCustomerResult =
  | { status: 'updated'; customer: CustomerSummary }
  | { status: 'conflict'; other: CustomerSummary }
  | { status: 'not_found' }

/** A contact left out is cleared. The email of another customer is refused, with who has it (a phone may be shared). */
export async function updateCustomer(id: string, input: CustomerInput): Promise<UpdateCustomerResult> {
  try {
    const rows = await db.update(customers)
      .set({
        firstName: input.firstName, lastName: input.lastName,
        email: input.email ?? null, phone: input.phone ?? null, notes: input.notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(customers.id, id))
      .returning()
    return rows.length > 0 ? { status: 'updated', customer: summarize(rows[0]) } : { status: 'not_found' }
  } catch (error) {
    if (pgErrorCode(error) !== UNIQUE_VIOLATION) throw error
    if (!input.email) throw error
    const [other] = await db.select().from(customers).where(and(ne(customers.id, id), eq(customers.email, input.email)))
    if (!other) throw error
    return { status: 'conflict', other: summarize(other) }
  }
}
