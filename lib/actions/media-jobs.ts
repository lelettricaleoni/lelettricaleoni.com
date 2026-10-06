'use server'
import { enqueueMediaJob } from '@/lib/queues/enqueue'
import { readJobStatus } from '@/lib/queues/status'
import { getAdminUser } from '@/lib/supabase/server'
import { isTrackedJobKey, type VideoJobStatus } from '@/lib/video-jobs'

/**
 * Worker status for the videos and photos shown in the admin panel.
 *
 * A Server Action rather than a route handler: the caller is our own client.
 */
export async function getMediaJobStatuses(
  storageKeys: string[],
): Promise<Record<string, VideoJobStatus>> {
  if (!(await getAdminUser())) return {}

  // Bounded: a panel with many items must not turn into an unbounded fan-out against the queue on every poll.
  const keys = storageKeys.filter(isTrackedJobKey).slice(0, 50)

  const entries = await Promise.all(keys.map(async (key) => [key, await readJobStatus(key)] as const))

  return Object.fromEntries(entries.filter((e): e is readonly [string, VideoJobStatus] => e[1] !== null))
}

/**
 * The browser calls this once a file has landed in the bucket, so that the worker starts now instead of at its next
 * scan. It never fails the upload: with the queue down, the scan finds the file within minutes.
 */
export async function confirmMediaUpload(storageKey: string): Promise<void> {
  if (!(await getAdminUser())) return
  if (!isTrackedJobKey(storageKey)) return
  await enqueueMediaJob(storageKey)
}
