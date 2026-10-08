import { inArray, type SQL } from 'drizzle-orm'
import { bikeReservations } from '@/lib/db'

/**
 * The states in which a reservation keeps a bike for its days. A bike being paid for (`held`) is as taken as a paid one:
 * the exclusion constraint says so (migration 0019), and everything that decides "is this bike free" has to say the same, or it
 * picks a bike the database will then refuse. `expired` and `cancelled` free the bike.
 *
 * Statements written by hand in `lib/reservations.ts` repeat this list as `r.status in ('confirmed', 'held')`: there is no
 * escape hatch to splice it in, on purpose (lib/db/no-raw-sql.test.ts), and tests/db/occupancy.test.ts holds them to it.
 */
export const OCCUPYING_STATUSES = ['confirmed', 'held'] as const

export function occupying(): SQL {
  return inArray(bikeReservations.status, [...OCCUPYING_STATUSES])
}
