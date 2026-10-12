import type { User } from '@supabase/supabase-js'
import { eq, sql } from 'drizzle-orm'
import { db, bikeReservations, bookingRefunds, bookings, customers } from '@/lib/db'
import { parseLanguage, type Language } from './language'

/**
 * What happens to the shop's record of a person when their account goes, and what they can take with them.
 *
 * The `customers` row is the SHOP's record, not only the account's: rentals registered at the counter point at
 * it, and a customer with rentals is never deleted (the history and the takings refer to them: lib/customers.ts).
 * So deleting an account does two different things, in two statements (a transaction cannot be used here, and
 * each statement is safe to repeat):
 *   - a customer with rentals stays, with its data, but is no longer tied to an account;
 *   - a customer with none is deleted along with the account.
 * What the shop keeps is said in the account page and in the privacy policy (a question for the lawyer, in the
 * `privacy-cookies` skill).
 */
export async function releaseCustomerOfAccount(userId: string): Promise<{ kept: boolean; deleted: boolean }> {
  // "Has rentals" means a bike that was (or still is) really rented, or a booking that is not just a lapsed attempt. The traces of
  // an attempt that never got paid (an expired booking and its expired bikes) are not history: they go with the customer.
  const hasHistory = sql`(
    EXISTS (SELECT 1 FROM bike_reservations r WHERE r.customer_id = customers.id AND r.status NOT IN ('held', 'expired'))
    OR EXISTS (SELECT 1 FROM bookings b WHERE b.customer_id = customers.id AND b.status <> 'expired')
  )`
  const kept = await db.execute<{ id: string }>(sql`
    UPDATE customers SET user_id = NULL, updated_at = now()
    WHERE user_id = ${userId}::uuid AND ${hasHistory}
    RETURNING id
  `)
  const deleted = await db.execute<{ id: string }>(sql`
    WITH doomed AS (
      SELECT id FROM customers WHERE user_id = ${userId}::uuid AND NOT ${hasHistory}
    ), lines AS (
      DELETE FROM bike_reservations WHERE customer_id IN (SELECT id FROM doomed) RETURNING id
    ), attempts AS (
      DELETE FROM bookings WHERE customer_id IN (SELECT id FROM doomed) RETURNING id
    )
    DELETE FROM customers WHERE id IN (SELECT id FROM doomed)
    RETURNING id
  `)
  return { kept: kept.length > 0, deleted: deleted.length > 0 }
}

/**
 * A copy of what the shop holds about the signed-in person, for them to keep (the right of access and of
 * portability). Everything about THEM, the shop's notes included (a note about a person is data about that person:
 * leaving it out would make the copy incomplete); nothing about other people and no internal ids.
 */
export async function buildAccountExport(user: User) {
  const [customer] = await db.select().from(customers).where(eq(customers.userId, user.id))
  const rentals = customer
    ? await db.select({
        kind: bikeReservations.kind,
        status: bikeReservations.status,
        startsOn: bikeReservations.startsOn,
        endsOn: bikeReservations.endsOn,
        amountCents: bikeReservations.amountCents,
        createdAt: bikeReservations.createdAt,
      }).from(bikeReservations).where(eq(bikeReservations.customerId, customer.id))
    : []
  const bookingRows = customer
    ? await db.select({
        status: bookings.status,
        startsOn: bookings.startsOn,
        endsOn: bookings.endsOn,
        totalCents: bookings.totalCents,
        createdAt: bookings.createdAt,
        confirmedAt: bookings.confirmedAt,
      }).from(bookings).where(eq(bookings.customerId, customer.id))
    : []

  const refundRows = customer
    ? await db.select({
        amountCents: bookingRefunds.amountCents,
        status: bookingRefunds.status,
        reason: bookingRefunds.reason,
        createdAt: bookingRefunds.createdAt,
      }).from(bookingRefunds).innerJoin(bookings, eq(bookings.id, bookingRefunds.bookingId)).where(eq(bookings.customerId, customer.id))
    : []

  return {
    exportedAt: new Date().toISOString(),
    account: {
      email: user.email ?? null,
      createdAt: user.created_at ?? null,
      lastSignInAt: user.last_sign_in_at ?? null,
      signInMethods: (user.identities ?? []).map((identity) => identity.provider),
    },
    profile: customer
      ? {
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          phone: customer.phone,
          language: customer.language,
          shopNotes: customer.notes,
          createdAt: customer.createdAt.toISOString(),
        }
      : null,
    rentals: rentals.map((rental) => ({
      ...rental,
      createdAt: rental.createdAt.toISOString(),
      // In euros, as shown to the customer; the database keeps whole cents.
      amount: rental.amountCents === null ? null : rental.amountCents / 100,
      amountCents: undefined,
    })),
    refunds: refundRows.map((refund) => ({
      amount: refund.amountCents / 100,
      status: refund.status,
      reason: refund.reason,
      createdAt: refund.createdAt.toISOString(),
    })),
    bookings: bookingRows.map((booking) => ({
      status: booking.status,
      startsOn: booking.startsOn,
      endsOn: booking.endsOn,
      total: booking.totalCents / 100,
      createdAt: booking.createdAt.toISOString(),
      confirmedAt: booking.confirmedAt?.toISOString() ?? null,
    })),
  }
}

/**
 * The language the person chose (account settings), or null when there is none yet (no customer, or an admin).
 * Once signed in the site follows it: this is where the sign-in sends them when they were not going anywhere in particular.
 * Never throws: a failure here must not keep anybody out.
 */
export async function getCustomerLanguage(userId: string): Promise<Language | null> {
  try {
    const [row] = await db.select({ language: customers.language }).from(customers).where(eq(customers.userId, userId))
    return parseLanguage(row?.language)
  } catch {
    return null
  }
}
