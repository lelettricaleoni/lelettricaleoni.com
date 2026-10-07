// lib/queues/status.ts
import type { Queue } from 'bullmq'
import { z } from 'zod'
import { CACHE_TIMEOUT_MS } from '@/lib/cache'
import { settle } from '@/lib/settle'
import type { VideoJobPhase, VideoJobStatus } from '@/lib/video-jobs'
import { jobIdFor, queueKindForKey } from './options'
import { getQueue } from './queues'
import { JobProgress } from './schemas'

/**
 * Where a job stands, read from the queue itself. The worker used to publish a status into a second store under keys
 * both repositories had to agree on; the queue already knows state, progress, attempts and failure, so the site asks it.
 *
 * Nothing here trusts what comes back: progress is parsed, because it was written by another process.
 */

const Returned = z.object({ sha256: z.string().regex(/^[0-9a-f]{64}$/) })

export interface JobSnapshot {
  /** BullMQ's own word: waiting, active, delayed, completed, failed, prioritized, paused… */
  state: string
  progress: unknown
  attemptsMade: number
  failedReason?: string
  returnvalue?: unknown
}

const RUNNING_PHASES: readonly string[] = ['downloading', 'transcoding', 'uploading']

export function statusFromSnapshot(job: JobSnapshot, now: number = Date.now()): VideoJobStatus {
  const parsed = JobProgress.safeParse(job.progress)
  const written = parsed.success ? parsed.data : undefined
  const updatedAt = written?.updatedAt ?? now

  switch (job.state) {
    case 'completed': {
      const returned = Returned.safeParse(job.returnvalue)
      return { phase: 'done', progress: 100, updatedAt, sha256: returned.success ? returned.data.sha256 : written?.sha256 }
    }
    case 'failed':
      return {
        phase: 'failed',
        attempt: job.attemptsMade,
        error: (job.failedReason || 'Processing failed').slice(0, 500),
        updatedAt,
      }
    case 'active': {
      const phase: VideoJobPhase = written && RUNNING_PHASES.includes(written.phase) ? written.phase : 'downloading'
      return { phase, progress: written?.percent, attempt: written?.attempt ?? job.attemptsMade + 1, updatedAt }
    }
    default:
      // Waiting, paused, prioritized, and delayed (the wait between two attempts).
      return { phase: 'queued', attempt: job.state === 'delayed' ? job.attemptsMade + 1 : undefined, updatedAt }
  }
}

export async function readStatusFromQueue(
  queue: Pick<Queue, 'getJob'>,
  jobId: string,
): Promise<VideoJobStatus | null> {
  const job = await queue.getJob(jobId)
  if (!job) return null
  return statusFromSnapshot({
    state: await job.getState(),
    progress: job.progress,
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason,
    returnvalue: job.returnvalue,
  })
}

/** Status of the job for an uploaded object, or null: no Redis, no such job, or Redis too slow to answer. */
export async function readJobStatus(
  storageKey: string,
  bucket: string | undefined = process.env.R2_BUCKET_NAME,
): Promise<VideoJobStatus | null> {
  const kind = queueKindForKey(storageKey)
  if (!kind || !bucket) return null
  const queue = getQueue(kind)
  if (!queue) return null
  return settle(readStatusFromQueue(queue, jobIdFor(bucket, storageKey)), CACHE_TIMEOUT_MS)
}
