import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'

/**
 * routes.bike_types stores category NAMES, not ids, so the name is the join key
 * between a route and its category. Anything that changes a name, or removes a
 * category, has to keep that column in step — otherwise a route silently keeps
 * a tag that no category answers to: it drops out of the public filter and the
 * suggested-bikes card, and the admin form (which offers only current
 * categories) would lose the tag on the next save.
 *
 * Not a Server Action file on purpose: the actions in lib/actions/bike-options.ts
 * call these after checking the caller is an admin.
 *
 * Each operation is ONE statement (a CTE), not `db.transaction`. A statement is
 * atomic on its own, and a transaction cannot be used here at all: with
 * `max_pipeline: 0` (lib/db/client-options.ts) postgres.js never marks the
 * connection as reserved, so its BEGIN is refused with UNSAFE_TRANSACTION.
 * That took rename and delete down in production on 2026-09-25, right after the
 * pipelining fix. Data-modifying CTEs all run to completion whether or not the
 * final SELECT reads them.
 */

export async function renameRouteBikeCategory(id: string, name: string, displayOrder: number) {
  const [row] = await db.execute<{ updated: number }>(sql`
    WITH cur AS (
      SELECT name FROM route_bike_categories WHERE id = ${id}::uuid
    ),
    upd AS (
      UPDATE route_bike_categories
      SET name = ${name}::text, display_order = ${displayOrder}::int
      WHERE id = ${id}::uuid
      RETURNING id
    ),
    retag AS (
      UPDATE routes
      SET bike_types = array_replace(bike_types, (SELECT name FROM cur), ${name}::text)
      WHERE (SELECT name FROM cur) <> ${name}::text
        AND bike_types @> ARRAY[(SELECT name FROM cur)]::text[]
      RETURNING id
    )
    SELECT (SELECT count(*) FROM upd)::int AS updated
  `)
  if (!row || row.updated === 0) throw new Error('Route category not found')
}

export type DeleteRouteBikeCategoryResult = { ok: true } | { ok: false; routesUsing: number }

/** Refuses while any route is still tagged with the category. */
export async function deleteRouteBikeCategory(id: string): Promise<DeleteRouteBikeCategoryResult> {
  const [row] = await db.execute<{ found: number; used: number }>(sql`
    WITH cur AS (
      SELECT name FROM route_bike_categories WHERE id = ${id}::uuid
    ),
    used AS (
      SELECT count(*)::int AS n FROM routes
      WHERE bike_types @> ARRAY[(SELECT name FROM cur)]::text[]
    ),
    del AS (
      -- Still fails loudly, by the foreign key, while a bike category is linked.
      DELETE FROM route_bike_categories
      WHERE id = ${id}::uuid AND (SELECT n FROM used) = 0
      RETURNING id
    )
    SELECT (SELECT count(*) FROM cur)::int AS found, (SELECT n FROM used) AS used
  `)
  if (!row || row.found === 0) return { ok: true }
  if (row.used > 0) return { ok: false, routesUsing: row.used }
  return { ok: true }
}
