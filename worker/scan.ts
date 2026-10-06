// worker/scan.ts
import { setTimeout as sleep } from 'node:timers/promises'
import type { Queue } from 'bullmq'
import {
  HLS_MANIFESTS,
  PHOTO_PUBLIC_PREFIXES,
  PHOTO_STAGING_PREFIXES,
  RENDITION_WIDTHS,
  VIDEO_STAGING_PREFIXES,
  deriveHlsPrefix,
  isMasterKey,
  isPhotoSourceKey,
  isVideoSourceKey,
  photoMasterKeyFor,
  photoRenditionKey,
} from '@/lib/media/keys'
import { addMediaJob } from '@/lib/queues/add-job'
import type { QueueKind } from '@/lib/queues/names'
import type { Logger } from './logger'
import type { ObjectStore } from './storage'

/**
 * **The job list is rebuilt, never stored.** A source object with no result beside it *is* the work to do, and that
 * truth lives in the bucket. The site enqueues a job the moment an upload ends; this scan is the safety net that finds
 * whatever that missed (Redis was down, a file arrived another way, the worker was off) and keeps the queue honest after
 * a restart or a rebuilt machine. Redis holds the queue for retries and ordering, not the record of what needs doing.
 */

export interface PendingJob {
  kind: QueueKind
  bucket: string
  key: string
}

/** Uploaded last, so its existence means every rendition exists. */
const MARKER_WIDTH = Math.min(...RENDITION_WIDTHS)

/** One prefix at a time: a failed listing of one must not hide the others. */
async function listOrLog(store: ObjectStore, bucket: string, prefix: string, log: Logger): Promise<string[]> {
  try {
    return await store.list(bucket, prefix)
  } catch (err) {
    log.error({ bucket, prefix, err: err instanceof Error ? err.message : String(err) }, 'scan: listing failed')
    return []
  }
}

async function pendingVideos(store: ObjectStore, bucket: string, log: Logger): Promise<PendingJob[]> {
  const out: PendingJob[] = []
  for (const prefix of VIDEO_STAGING_PREFIXES) {
    for (const key of await listOrLog(store, bucket, prefix, log)) {
      if (!isVideoSourceKey(key)) continue
      const streamPrefix = deriveHlsPrefix(key)
      const done = await Promise.all(HLS_MANIFESTS.map((name) => store.exists(bucket, streamPrefix + name)))
      if (!done.some(Boolean)) out.push({ kind: 'video', bucket, key })
    }
  }
  return out
}

async function pendingPhotos(store: ObjectStore, bucket: string, log: Logger): Promise<PendingJob[]> {
  const out: PendingJob[] = []
  for (const prefix of PHOTO_STAGING_PREFIXES) {
    for (const key of await listOrLog(store, bucket, prefix, log)) {
      if (isPhotoSourceKey(key) && !(await store.exists(bucket, photoMasterKeyFor(key)))) {
        out.push({ kind: 'photo', bucket, key })
      }
    }
  }
  return out
}

async function pendingRenditions(store: ObjectStore, bucket: string, log: Logger): Promise<PendingJob[]> {
  const out: PendingJob[] = []
  for (const prefix of PHOTO_PUBLIC_PREFIXES) {
    // The listing already says what exists: no request per master, on a scan that runs for as long as the worker lives.
    const keys = await listOrLog(store, bucket, prefix, log)
    const present = new Set(keys)
    for (const key of keys) {
      if (isMasterKey(key) && !present.has(photoRenditionKey(key, MARKER_WIDTH))) {
        out.push({ kind: 'renditions', bucket, key })
      }
    }
  }
  return out
}

export async function findPending(store: ObjectStore, buckets: string[], log: Logger): Promise<PendingJob[]> {
  const out: PendingJob[] = []
  for (const bucket of buckets) {
    out.push(...(await pendingVideos(store, bucket, log)))
    out.push(...(await pendingPhotos(store, bucket, log)))
    out.push(...(await pendingRenditions(store, bucket, log)))
  }
  return out
}

/** One pass: add every pending object to its queue (the job id is the object, so a duplicate is refused by the queue). */
export async function scanOnce(
  queues: Record<QueueKind, Pick<Queue, 'add'>>,
  store: ObjectStore,
  buckets: string[],
  log: Logger,
): Promise<number> {
  const pending = await findPending(store, buckets, log)
  for (const job of pending) await addMediaJob(queues[job.kind], job.kind, job.bucket, job.key)
  return pending.length
}

/** Run now, then after every interval, until the signal aborts. A failing run is the caller's to log; it never stops the loop. */
export async function startScanner(run: () => Promise<void>, intervalMs: number, signal: AbortSignal): Promise<void> {
  while (!signal.aborted) {
    try {
      await run()
    } catch {
      // `run` logs its own failure; the next pass tries again.
    }
    try {
      await sleep(intervalMs, undefined, { signal })
    } catch {
      return
    }
  }
}
