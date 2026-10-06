// lib/queues/add-job.ts
import type { Queue } from 'bullmq'
import { JOB_NAMES, type QueueKind } from './names'
import { JOB_OPTIONS, jobIdFor } from './options'
import { MediaJobData } from './schemas'

/** Add one job to a queue. Used by the site when an upload ends and by the worker's scan. */
export async function addMediaJob(
  queue: Pick<Queue, 'add'>,
  kind: QueueKind,
  bucket: string,
  key: string,
): Promise<void> {
  await queue.add(JOB_NAMES[kind], MediaJobData.parse({ bucket, key }), { ...JOB_OPTIONS, jobId: jobIdFor(bucket, key) })
}
