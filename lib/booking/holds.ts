import { and, eq, gte, sql } from 'drizzle-orm'
import { db, bikeReservations, bookings, type Booking } from '@/lib/db'
import type { IsoDate } from '@/lib/dates'
import { EXCLUSION_VIOLATION, UNIQUE_VIOLATION, pgErrorCode } from '@/lib/pg-errors'
import { ABANDONED_LIMIT, HOLD_MINUTES, type BikeSpec } from './rules'

/*
 * Holding the bikes of a booking while the person pays. No Stripe in here: these functions only move rows between states, and the
 * layer that talks to Stripe wraps them (it may free a hold only after Stripe says the session can no longer be paid).
 *
 * Every step is ONE statement: this client cannot open a transaction (max_pipeline: 0, lib/db/client-options.ts). Two statements that
 * must agree (the booking and its lines) are a CTE in which the lines follow the booking's own update, so the one that wins the
 * booking row is the only one that touches the lines.
 */

const MAX_ATTEMPTS = 8

export interface HoldLine extends BikeSpec {
  amountCents: number
}

export interface StartHoldInput {
  /** The idempotency key of the whole booking: the same key finds the same booking. */
  bookingKey: string
  customerId: string
  startsOn: IsoDate
  endsOn: IsoDate
  language: string
  lines: HoldLine[]
}

export type StartHoldResult =
  | { status: 'held'; bookingId: string; holdExpiresAt: Date; replayed: boolean }
  | { status: 'closed'; bookingId: string; bookingStatus: string }
  /** The same key came back while the first request is still holding the bikes (a double click): wait, do not pay yet. */
  | { status: 'in_progress'; bookingId: string }
  | { status: 'has_pending'; bookingId: string }
  | { status: 'too_many_attempts' }
  | { status: 'unavailable'; lineIndex: number }
  | { status: 'try_again'; lineIndex: number }

/** The booking this customer made with the key. A key is never answered with somebody else's booking. */
async function findByKey(bookingKey: string, customerId: string) {
  const [row] = await db.select().from(bookings).where(and(eq(bookings.requestKey, bookingKey), eq(bookings.customerId, customerId)))
  return row
}

async function findById(bookingId: string) {
  const [row] = await db.select().from(bookings).where(eq(bookings.id, bookingId))
  return row
}

/** What asking again with the key of an existing booking means. */
async function replayOf(booking: Booking): Promise<StartHoldResult> {
  if (booking.status !== 'pending') return { status: 'closed', bookingId: booking.id, bookingStatus: booking.status }
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(bikeReservations)
    .where(and(eq(bikeReservations.bookingId, booking.id), eq(bikeReservations.status, 'held')))
  if ((row?.count ?? 0) < booking.lineCount) return { status: 'in_progress', bookingId: booking.id }
  return { status: 'held', bookingId: booking.id, holdExpiresAt: booking.holdExpiresAt, replayed: true }
}

/** The customer's booking that is waiting for a payment, if any (the caller decides what to do with an overdue one). */
export async function findPendingBooking(customerId: string): Promise<{ id: string; holdExpiresAt: Date; stripeSessionId: string | null } | null> {
  const [row] = await db.select({ id: bookings.id, holdExpiresAt: bookings.holdExpiresAt, stripeSessionId: bookings.stripeSessionId })
    .from(bookings)
    .where(and(eq(bookings.customerId, customerId), eq(bookings.status, 'pending')))
    .limit(1)
  return row ?? null
}

/** How many bookings of the customer lapsed (were left or given up) in the last hour. */
async function countRecentlyLapsed(customerId: string): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` })
    .from(bookings)
    .where(and(
      eq(bookings.customerId, customerId),
      eq(bookings.status, 'expired'),
      gte(bookings.createdAt, sql`now() - interval '1 hour'`),
    ))
  return row?.count ?? 0
}

/**
 * Holds the bikes of a booking: the booking first, then one bike per line (a free bike of the model, size and version, the oldest
 * first), each as `held` for the days. If a line finds nobody free, everything held so far is released and the line is named; if the
 * database refuses a bike another request took a moment earlier, the line picks again, up to a few times.
 */
export async function startHold(input: StartHoldInput): Promise<StartHoldResult> {
  const existing = await findByKey(input.bookingKey, input.customerId)
  if (existing) return replayOf(existing)

  const pending = await findPendingBooking(input.customerId)
  if (pending) return { status: 'has_pending', bookingId: pending.id }
  if ((await countRecentlyLapsed(input.customerId)) >= ABANDONED_LIMIT) return { status: 'too_many_attempts' }

  const totalCents = input.lines.reduce((sum, line) => sum + line.amountCents, 0)
  let created: { id: string; holdExpiresAt: Date } | undefined
  try {
    const rows = await db.insert(bookings)
      .values({
        customerId: input.customerId,
        requestKey: input.bookingKey,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        totalCents,
        language: input.language,
        lineCount: input.lines.length,
        holdExpiresAt: sql`now() + make_interval(mins => ${HOLD_MINUTES})`,
      })
      .onConflictDoNothing({ target: bookings.requestKey })
      .returning({ id: bookings.id, holdExpiresAt: bookings.holdExpiresAt })
    created = rows[0]
  } catch (error) {
    // The only other unique index is "one pending booking per customer": two tabs raced and the other one got there first.
    if (pgErrorCode(error) !== UNIQUE_VIOLATION) throw error
    const other = await findPendingBooking(input.customerId)
    return other ? { status: 'has_pending', bookingId: other.id } : { status: 'try_again', lineIndex: 0 }
  }
  if (!created) {
    // The same key won a race against this very call.
    const raced = await findByKey(input.bookingKey, input.customerId)
    return raced ? replayOf(raced) : { status: 'try_again', lineIndex: 0 }
  }

  try {
    for (let index = 0; index < input.lines.length; index++) {
      const outcome = await holdOneBike(created.id, input, input.lines[index])
      if (outcome === 'closed') {
        return { status: 'closed', bookingId: created.id, bookingStatus: (await findById(created.id))?.status ?? 'expired' }
      }
      if (outcome !== 'held') {
        await expireBooking(created.id)
        return outcome === 'none_free' ? { status: 'unavailable', lineIndex: index } : { status: 'try_again', lineIndex: index }
      }
    }
  } catch (error) {
    // Whatever went wrong, do not leave a half-built booking holding bikes and blocking the customer for half an hour.
    await expireBooking(created.id).catch(() => undefined)
    throw error
  }
  return { status: 'held', bookingId: created.id, holdExpiresAt: created.holdExpiresAt, replayed: false }
}

/**
 * One bike for one line of the booking. 'closed' means the booking is no longer pending (somebody expired it while this was
 * running): nothing is held, because a bike held for a closed booking would never be freed by anyone.
 */
export async function holdOneBike(
  bookingId: string, input: StartHoldInput, line: HoldLine,
): Promise<'held' | 'none_free' | 'closed' | 'exhausted'> {
  // One key per line, kept across the attempts, so a repeated statement cannot hold the same line twice.
  const lineKey = crypto.randomUUID()
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const rows = await db.execute<{ id: string }>(sql`
        insert into bike_reservations (bike_unit_id, kind, status, starts_on, ends_on, customer_id, amount_cents, request_key, booking_id)
        select u.id, 'online_rental'::reservation_kind, 'held'::reservation_status,
               ${input.startsOn}::date, ${input.endsOn}::date, ${input.customerId}::uuid, ${line.amountCents}::int,
               ${lineKey}::uuid, ${bookingId}::uuid
        from bike_units u
        where u.bike_model_id = ${line.bikeModelId}::uuid
          and u.bike_size_id = ${line.bikeSizeId}::uuid
          and u.bike_version_id = ${line.bikeVersionId}::uuid
          and (u.retired_on is null or ${input.endsOn}::date <= u.retired_on)
          and exists (select 1 from bookings b where b.id = ${bookingId}::uuid and b.status = 'pending')
          and not exists (
            select 1 from bike_reservations r
            where r.bike_unit_id = u.id and r.status in ('confirmed', 'held')
              and r.during && daterange(${input.startsOn}::date, ${input.endsOn}::date, '[)'))
        order by u.created_at, u.id
        limit 1
        on conflict (request_key) do nothing
        returning id`)
      if (rows.length > 0) return 'held'
      return (await findById(bookingId))?.status === 'pending' ? 'none_free' : 'closed'
    } catch (error) {
      // Another request took the bike this one had picked, a moment earlier: pick again.
      if (pgErrorCode(error) === EXCLUSION_VIOLATION) continue
      throw error
    }
  }
  return 'exhausted'
}

/**
 * Pending → confirmed, with every held bike of the booking, in one statement. Does nothing (and says so) when the booking is no
 * longer pending, or does not hold all the bikes it is made of: a payment cannot confirm bikes that have been released.
 */
export async function confirmHold(bookingId: string): Promise<{ confirmed: boolean; lines: number }> {
  const [row] = await db.execute<{ bookings: number; lines: number }>(sql`
    with b as (
      update bookings set status = 'confirmed', confirmed_at = now()
      where id = ${bookingId}::uuid and status = 'pending'
        and line_count = (select count(*) from bike_reservations r where r.booking_id = bookings.id and r.status = 'held')
      returning id
    ), l as (
      update bike_reservations set status = 'confirmed'
      where booking_id in (select id from b) and status = 'held'
      returning id
    )
    select (select count(*) from b)::int as bookings, (select count(*) from l)::int as lines`)
  return { confirmed: row.bookings > 0, lines: row.lines }
}

/** Pending → expired, and every held bike of the booking freed, in one statement. */
export async function expireBooking(bookingId: string): Promise<{ expired: boolean; lines: number }> {
  const [row] = await db.execute<{ bookings: number; lines: number }>(sql`
    with b as (
      update bookings set status = 'expired'
      where id = ${bookingId}::uuid and status = 'pending'
      returning id
    ), l as (
      update bike_reservations set status = 'expired'
      where booking_id in (select id from b) and status = 'held'
      returning id
    )
    select (select count(*) from b)::int as bookings, (select count(*) from l)::int as lines`)
  return { expired: row.bookings > 0, lines: row.lines }
}

/** The pending bookings whose time has run out: what the sweeper settles (with Stripe) before freeing the bikes. */
export async function findOverduePending(): Promise<{ id: string; stripeSessionId: string | null }[]> {
  return db.select({ id: bookings.id, stripeSessionId: bookings.stripeSessionId })
    .from(bookings)
    .where(and(eq(bookings.status, 'pending'), sql`${bookings.holdExpiresAt} <= now()`))
}
