import { max, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, bikeCategories } from '@/lib/db'

/*
 * The order of the bike categories: it is the order the bikes are shown in, everywhere (the public bikes page, the booking page, the models in
 * the panel): the categories first, in this order, then the models of each in theirs. It is set by dragging, in the panel.
 */

const orderedIdsSchema = z.array(z.uuid()).max(500)

/** The place a new category takes: after the last one. */
export async function nextCategoryOrder(): Promise<number> {
  const [row] = await db.select({ last: max(bikeCategories.displayOrder) }).from(bikeCategories)
  return (row?.last ?? -1) + 1
}

/**
 * Puts the categories in the order given: the first id is the first category. One statement, so the order is never half written (a transaction
 * is not available on the shared client: lib/db/no-transactions.test.ts). An id that is not a category is ignored; a category that is not
 * in the list keeps the place it had.
 */
export async function reorderBikeCategories(orderedIds: unknown): Promise<void> {
  const ids = orderedIdsSchema.parse(orderedIds)
  if (ids.length === 0) return
  const rows = sql.join(ids.map((id, position) => sql`(${id}::uuid, ${position}::int)`), sql`, `)
  await db.execute(sql`
    update bike_categories as category set display_order = ordered.position
    from (values ${rows}) as ordered(id, position)
    where category.id = ordered.id
  `)
}
