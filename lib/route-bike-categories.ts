import { eq, sql } from 'drizzle-orm'
import { db, routes, routeBikeCategories } from '@/lib/db'

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
 */

export async function renameRouteBikeCategory(id: string, name: string, displayOrder: number) {
  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(routeBikeCategories).where(eq(routeBikeCategories.id, id))
    if (!current) throw new Error('Route category not found')

    await tx.update(routeBikeCategories).set({ name, displayOrder }).where(eq(routeBikeCategories.id, id))

    if (current.name !== name) {
      await tx
        .update(routes)
        .set({ bikeTypes: sql`array_replace(${routes.bikeTypes}, ${current.name}, ${name})` })
        .where(sql`${routes.bikeTypes} @> ARRAY[${current.name}]::text[]`)
    }
  })
}

export type DeleteRouteBikeCategoryResult = { ok: true } | { ok: false; routesUsing: number }

/** Refuses while any route is still tagged with the category. */
export async function deleteRouteBikeCategory(id: string): Promise<DeleteRouteBikeCategoryResult> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(routeBikeCategories).where(eq(routeBikeCategories.id, id))
    if (!current) return { ok: true }

    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(routes)
      .where(sql`${routes.bikeTypes} @> ARRAY[${current.name}]::text[]`)
    if (count > 0) return { ok: false, routesUsing: count }

    // Still fails loudly, by the foreign key, while a bike category is linked.
    await tx.delete(routeBikeCategories).where(eq(routeBikeCategories.id, id))
    return { ok: true }
  })
}
