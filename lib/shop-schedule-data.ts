import { asc, eq, gt, sql, type SQL } from 'drizzle-orm'
import { db, shopClosures, shopOpeningHours } from '@/lib/db'
import { exclusiveEnd, inclusiveEnd, todayInRome, type IsoDate } from '@/lib/dates'
import type { HoursRange, ShopSchedule } from './shop-schedule'

/*
 * The shop's opening hours and closures, read from and written to the database. The functions that decide anything from them are pure and
 * live in ./shop-schedule.ts. Not cached on purpose: it is read on every request of the booking page and of checkout (two tiny queries on
 * pages that are already dynamic), so a change made in the panel is seen at once and checkout never decides with an old schedule.
 *
 * Not a Server Action file: the actions in lib/actions/shop-hours.ts check that the caller is an admin, then call these.
 */

/** Postgres gives `time` as 'HH:MM:SS'; the schedule speaks 'HH:MM'. */
const hhmm = (time: string) => time.slice(0, 5)

export async function loadShopSchedule(): Promise<ShopSchedule> {
  const [hours, closures] = await Promise.all([
    db.select().from(shopOpeningHours).orderBy(asc(shopOpeningHours.weekday), asc(shopOpeningHours.opensAt)),
    db.select().from(shopClosures).orderBy(asc(shopClosures.startsOn)),
  ])
  const weekly: Record<number, HoursRange[]> = {}
  for (const row of hours) (weekly[row.weekday] ??= []).push({ opensAt: hhmm(row.opensAt), closesAt: hhmm(row.closesAt) })
  return { weekly, closures: closures.map((row) => ({ startsOn: row.startsOn, endsOn: row.endsOn })) }
}

/**
 * Makes the weekly hours exactly `week`: ONE statement (a data-modifying CTE), because a transaction cannot be used here (`max_pipeline: 0`)
 * and delete-then-insert as two would leave the shop with no hours between them, or for good if the second failed. The database refuses a
 * range that does not open before it closes or a weekday outside 1..7, and then nothing changes.
 */
export async function saveWeeklyHours(week: Record<number, HoursRange[]>): Promise<void> {
  const rows = Object.entries(week).flatMap(([weekday, ranges]) => ranges.map((range) => ({ weekday: Number(weekday), ...range })))
  if (rows.length === 0) {
    await db.delete(shopOpeningHours)
    return
  }
  const list = (values: SQL[], type: SQL) => sql`ARRAY[${sql.join(values, sql`, `)}]::${type}`
  await db.execute(sql`
    WITH removed AS (DELETE FROM shop_opening_hours RETURNING 1)
    INSERT INTO shop_opening_hours (weekday, opens_at, closes_at)
    SELECT w, o::time, c::time
    FROM unnest(
      ${list(rows.map((row) => sql`${row.weekday}::smallint`), sql`smallint[]`)},
      ${list(rows.map((row) => sql`${row.opensAt}::text`), sql`text[]`)},
      ${list(rows.map((row) => sql`${row.closesAt}::text`), sql`text[]`)}
    ) AS t(w, o, c)`)
}

export interface Closure { id: string; startsOn: IsoDate; lastDay: IsoDate; reason: string | null }

/** The closures that are on now or still to come, the nearest first; the last day is included (the panel speaks like people do). */
export async function listClosures(today: IsoDate = todayInRome()): Promise<Closure[]> {
  const rows = await db.select().from(shopClosures).where(gt(shopClosures.endsOn, today)).orderBy(asc(shopClosures.startsOn))
  return rows.map((row) => ({ id: row.id, startsOn: row.startsOn, lastDay: inclusiveEnd(row.endsOn), reason: row.reason }))
}

/** `lastDay` is included; it is stored with the end exclusive. The database refuses one that ends before it starts. */
export async function addClosure(input: { startsOn: IsoDate; lastDay: IsoDate; reason: string | null }): Promise<void> {
  await db.insert(shopClosures).values({ startsOn: input.startsOn, endsOn: exclusiveEnd(input.lastDay), reason: input.reason })
}

export async function removeClosure(id: string): Promise<void> {
  await db.delete(shopClosures).where(eq(shopClosures.id, id))
}
