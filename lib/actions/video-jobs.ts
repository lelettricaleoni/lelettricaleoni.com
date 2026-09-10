'use server'
import { getAdminUser } from '@/lib/supabase/server'
import { readJobStatus, type VideoJobStatus } from '@/lib/video-jobs'

/**
 * Transcoding status for the videos shown in the admin panel.
 *
 * A Server Action rather than a route handler: the caller is our own client.
 * Only the worker gets an endpoint, because it cannot address one of these.
 */
export async function getVideoJobStatuses(
  storageKeys: string[]
): Promise<Record<string, VideoJobStatus>> {
  if (!(await getAdminUser())) return {}

  // Bounded: a panel with many videos must not turn into an unbounded fan-out
  // against the cache on every poll.
  const keys = storageKeys
    .filter((k) => typeof k === 'string' && k.startsWith('private/route-videos/'))
    .slice(0, 50)

  const entries = await Promise.all(
    keys.map(async (key) => [key, await readJobStatus(key)] as const)
  )

  return Object.fromEntries(
    entries.filter((e): e is readonly [string, VideoJobStatus] => e[1] !== null)
  )
}
