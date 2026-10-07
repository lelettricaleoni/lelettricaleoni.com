import { and, eq, gte, sql } from 'drizzle-orm'
import { db, bookings } from '@/lib/db'
import type { IsoDate } from '@/lib/dates'
import { EXCLUSION_VIOLATION, pgErrorCode } from '@/lib/pg-errors'
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
  | { status: 'has_pending'; bookingId: string }
  | { status: 'too_many_attempts' }
  | { status: 'unavailable'; lineIndex: number }
  | { status: 'try_again'; lineIndex: number }

async function findByKey(bookingKey: string) {
  const [row] = await db.select().from(bookings).where(eq(bookings.requestKey, bookingKey))
  return row
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
  const existing = await findByKey(input.bookingKey)
  if (existing) {
    return existing.status === 'pending'
      ? { status: 'held', bookingId: existing.id, holdExpiresAt: existing.holdExpiresAt, replayed: true }
      : { status: 'closed', bookingId: existing.id, bookingStatus: existing.status }
  }

  const pending = await findPendingBooking(input.customerId)
  if (pending) return { status: 'has_pending', bookingId: pending.id }
  if ((await countRecentlyLapsed(input.customerId)) >= ABANDONED_LIMIT) return { status: 'too_many_attempts' }

  const totalCents = input.lines.reduce((sum, line) => sum + line.amountCents, 0)
  const [created] = await db.insert(bookings)
    .values({
      customerId: input.customerId,
      requestKey: input.bookingKey,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      totalCents,
      language: input.language,
      holdExpiresAt: sql`now() + make_interval(mins => ${HOLD_MINUTES})`,
    })
    .onConflictDoNothing({ target: bookings.requestKey })
    .returning({ id: bookings.id, holdExpiresAt: bookings.holdExpiresAt })
  if (!created) {
    // The same key won a race against this very call.
    const raced = await findByKey(input.bookingKey)
    if (!raced) return { status: 'try_again', lineIndex: 0 }
    return raced.status === 'pending'
      ? { status: 'held', bookingId: raced.id, holdExpiresAt: raced.holdExpiresAt, replayed: true }
      : { status: 'closed', bookingId: raced.id, bookingStatus: raced.status }
  }

  for (let index = 0; index < input.lines.length; index++) {
    const outcome = await holdOneBike(created.id, input, input.lines[index])
    if (outcome !== 'held') {
      await expireBooking(created.id)
      return outcome === 'none_free' ? { status: 'unavailable', lineIndex: index } : { status: 'try_again', lineIndex: index }
    }
  }
  return { status: 'held', bookingId: created.id, holdExpiresAt: created.holdExpiresAt, replayed: false }
}

async function holdOneBike(bookingId: string, input: StartHoldInput, line: HoldLine): Promise<'held' | 'none_free' | 'exhausted'> {
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
          and not exists (
            select 1 from bike_reservations r
            where r.bike_unit_id = u.id and r.status in ('confirmed', 'held')
              and r.during && daterange(${input.startsOn}::date, ${input.endsOn}::date, '[)'))
        order by u.created_at, u.id
        limit 1
        on conflict (request_key) do nothing
        returning id`)
      if (rows.length > 0) return 'held'
      return 'none_free'
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
 * longer pending: a payment cannot confirm bikes that have been released.
 */
export async function confirmHold(bookingId: string): Promise<{ confirmed: boolean; lines: number }> {
  const [row] = await db.execute<{ bookings: number; lines: number }>(sql`
    with b as (
      update bookings set status = 'confirmed', confirmed_at = now()
      where id = ${bookingId}::uuid and status = 'pending'
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
