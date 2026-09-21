'use server'
import { eq, ne, and } from 'drizzle-orm'
import { db, media } from '@/lib/db'
import { getAdminUser } from '@/lib/supabase/server'

/**
 * Called once a video's transcode job reports `done` with a sha256 — the
 * only moment the worker knows it, since the source file is gone right
 * after. Safe to call before the media row exists yet (a brand-new upload
 * not saved with the form): the UPDATE simply matches zero rows, and the
 * hash reaches the database anyway once the form is saved, carried through
 * mediaItems (see MediaUpload).
 */
export async function recordVideoHashAction(storageKey: string, sha256: string): Promise<{ duplicate: boolean }> {
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
