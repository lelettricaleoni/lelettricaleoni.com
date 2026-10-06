// lib/queues/enqueue.ts
import type { Queue } from 'bullmq'
import { addMediaJob } from './add-job'
import { queueKindForKey } from './options'
import { getQueue } from './queues'

export type EnqueueOutcome = 'queued' | 'skipped' | 'unavailable'

export interface EnqueueOptions {
  /** Defaults to the bucket of this environment. */
  bucket?: string
  /** Defaults to the real queue; tests pass their own, `null` means "no Redis". */
  queue?: Pick<Queue, 'add'> | null
}

/**
 * Hand an uploaded object to the worker now, instead of waiting for its next scan.
 *
 * Never throws and never fails an upload: if the queue is down the scan finds the file within minutes, which is the
 * reason the scan exists. Adding the same object twice is harmless, the job id is the object.
 */
export async function enqueueMediaJob(storageKey: string, options: EnqueueOptions = {}): Promise<EnqueueOutcome> {
  const kind = queueKindForKey(storageKey)
  const bucket = options.bucket ?? process.env.R2_BUCKET_NAME
  if (!kind || !bucket) return 'skipped'

  const queue = options.queue !== undefined ? options.queue : getQueue(kind)
  if (!queue) return 'unavailable'

  try {
    await addMediaJob(queue, kind, bucket, storageKey)
    return 'queued'
  } catch (err) {
    console.error('[queue] could not enqueue', storageKey, err instanceof Error ? err.message : err)
    return 'unavailable'
  }
}
