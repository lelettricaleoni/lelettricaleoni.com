// lib/queues/options.ts
import { isPhotoSourceKey, isVideoSourceKey } from '@/lib/media/keys'
import type { QueueKind } from './names'

export const MAX_ATTEMPTS = 3
export const BACKOFF_MS = 10_000

/**
 * Options of every job, whoever adds it (the site on upload, the worker's scan). Finished jobs stay an hour so the
 * panel can show them; failed ones stay (five hundred) so they can be seen and retried, and a failed job's id keeps the
 * scan from adding the same object again in a loop.
 */
export const JOB_OPTIONS = {
  attempts: MAX_ATTEMPTS,
  backoff: { type: 'exponential' as const, delay: BACKOFF_MS },
  removeOnComplete: { age: 60 * 60 },
  removeOnFail: { count: 500 },
}

/** The job id is the object, so the queue refuses a duplicate on its own. */
export function jobIdFor(bucket: string, key: string): string {
  return `${bucket}/${key}`
}

/** Which queue takes the source object a key names, or null when the key is not something the worker processes. */
export function queueKindForKey(key: string): Extract<QueueKind, 'video' | 'photo'> | null {
  if (isVideoSourceKey(key)) return 'video'
  if (isPhotoSourceKey(key)) return 'photo'
  return null
}
