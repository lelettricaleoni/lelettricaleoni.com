'use server'
import { eq, ne, and } from 'drizzle-orm'
import { db, media } from '@/lib/db'
import { getAdminUser } from '@/lib/supabase/server'

/**
 * Before a photo is uploaded: does an identical one already exist anywhere on
 * the site? The browser hashes the file and asks here, so the admin can be
 * warned before any bytes move (see lib/hash-client.ts for why the browser and
 * not the server hashes it).
 */
export async function findDuplicateMediaAction(sha256: string): Promise<{ duplicate: boolean }> {
  const user = await getAdminUser()
  if (!user) throw new Error('Unauthorized')

  const [match] = await db.select({ id: media.id }).from(media).where(eq(media.sha256, sha256)).limit(1)
  return { duplicate: Boolean(match) }
}

/**
 * Called once a job reports `done` with a sha256 — the only moment the worker
 * knows it, since the source file is gone right after. Covers videos, and any
 * photo the browser could not hash itself (a file too large to hold in memory);
 * for a hashed photo it just re-writes the value it already has. Safe to call
 * before the media row exists yet (a brand-new upload not saved with the form):
 * the UPDATE simply matches zero rows, and the hash reaches the database anyway
 * once the form is saved, carried through mediaItems (see MediaUpload).
 */
export async function recordMediaHashAction(storageKey: string, sha256: string): Promise<{ duplicate: boolean }> {
  const user = await getAdminUser()
  if (!user) throw new Error('Unauthorized')

  const [existingMatch] = await db
    .select({ id: media.id })
    .from(media)
    .where(and(eq(media.sha256, sha256), ne(media.storageKey, storageKey)))
    .limit(1)

  await db.update(media).set({ sha256 }).where(eq(media.storageKey, storageKey))

  return { duplicate: Boolean(existingMatch) }
}
