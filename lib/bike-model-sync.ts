import { sql, eq } from 'drizzle-orm'
import { db, media, type Media } from '@/lib/db'

/**
 * What a bike model's save writes besides the model row: its sizes, its
 * versions and its photos and videos.
 *
 * Each is ONE statement (a data-modifying CTE), never delete-then-insert as two.
 * A statement is atomic on its own, and a transaction cannot be used here at
 * all (see lib/route-bike-categories.ts: `max_pipeline: 0` makes postgres.js
 * refuse the BEGIN). The two-statement version cleared every size and version
 * of a model first and wrote them back second, so a save that failed in between
 * — or was cut off — left the model with none of them. That is how selections
 * went missing in the panel.
 *
 * Not a Server Action file on purpose: the actions in lib/actions/bike-models.ts
 * call these after checking the caller is an admin.
 */

const uuidArray = (ids: string[]) =>
  sql`ARRAY[${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)}]::uuid[]`

/**
 * Makes the model's sizes and versions exactly the given ones: what is no
 * longer ticked goes, what is new comes in, what stays is not touched — all in
 * one statement, so there is no moment with fewer than the ticked ones.
 */
export async function syncModelSizesAndVersions(modelId: string, sizeIds: string[], versionIds: string[]) {
  await db.execute(sql`
    WITH
    removed_sizes AS (
      DELETE FROM bike_model_sizes
      WHERE bike_model_id = ${modelId}::uuid AND bike_size_id <> ALL(${uuidArray(sizeIds)})
      RETURNING 1
    ),
    added_sizes AS (
      INSERT INTO bike_model_sizes (bike_model_id, bike_size_id)
      SELECT ${modelId}::uuid, s FROM unnest(${uuidArray(sizeIds)}) AS s
      ON CONFLICT (bike_model_id, bike_size_id) DO NOTHING
      RETURNING 1
    ),
    removed_versions AS (
      DELETE FROM bike_model_versions
      WHERE bike_model_id = ${modelId}::uuid AND bike_version_id <> ALL(${uuidArray(versionIds)})
      RETURNING 1
    )
    INSERT INTO bike_model_versions (bike_model_id, bike_version_id)
    SELECT ${modelId}::uuid, v FROM unnest(${uuidArray(versionIds)}) AS v
    ON CONFLICT (bike_model_id, bike_version_id) DO NOTHING
  `)
}

export interface ModelMediaItem {
  key: string
  type: 'photo' | 'video'
  sha256?: string
}

/**
 * Replaces the model's media list with the given one, in order, in one
 * statement, and returns the rows that are gone, so the caller deletes their
 * files from storage AFTER the database is right. Deleting the files first, as
 * this used to, loses the pictures for good if anything fails afterwards.
 */
export async function replaceModelMedia(modelId: string, items: ModelMediaItem[]): Promise<Media[]> {
  const existing = await db.select().from(media).where(eq(media.bikeModelId, modelId))
  const kept = new Set(items.map((item) => item.key))
  const removed = existing.filter((row) => !kept.has(row.storageKey))

  const rows = JSON.stringify(
    items.map((item, ord) => ({ key: item.key, type: item.type, sha256: item.sha256 ?? null, ord }))
  )
  await db.execute(sql`
    WITH removed AS (
      DELETE FROM media WHERE bike_model_id = ${modelId}::uuid RETURNING 1
    )
    INSERT INTO media (bike_model_id, storage_key, media_type, display_order, sha256)
    SELECT ${modelId}::uuid, x.key, x.type::media_type, x.ord, x.sha256
    FROM jsonb_to_recordset(${rows}::jsonb) AS x(key text, type text, sha256 text, ord int)
  `)
  return removed
}
