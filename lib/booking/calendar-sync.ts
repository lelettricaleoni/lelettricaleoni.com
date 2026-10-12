import 'server-only'
import { and, eq, inArray } from 'drizzle-orm'
import { db, bikeReservations } from '@/lib/db'
import { syncReservation } from '@/lib/integrations/google-calendar/sync'

/**
 * Sends every bike of a booking to Google Calendar: a booked one gets its event, a cancelled one loses it (`syncReservation` makes the
 * calendar match the reservation, and never throws: a problem with Google goes to the integration's Activity, never to the person).
 * Idempotent, so it may be called again after a reload. Called after the response (`after()`) by what changes a booking.
 */
export async function syncBookingLines(bookingId: string): Promise<void> {
  const lines = await db.select({ id: bikeReservations.id }).from(bikeReservations)
    .where(and(eq(bikeReservations.bookingId, bookingId), inArray(bikeReservations.status, ['confirmed', 'cancelled'])))
  for (const line of lines) await syncReservation(line.id)
}
