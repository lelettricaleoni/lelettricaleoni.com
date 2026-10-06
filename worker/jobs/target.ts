import { UnrecoverableError } from 'bullmq'
import { MediaJobData } from '@/lib/queues/schemas'
import type { WorkerConfig } from '../config'
import type { MediaJob } from './types'

/**
 * What a job agrees to work on. The job's data comes from Redis and names a bucket and a key; both end up in a working
 * folder path that is wiped, and in requests to storage. So the bucket must be one this worker is configured for (which
 * also keeps an environment's worker off another environment's objects), and the key must be of the kind this job handles.
 * A refusal is unrecoverable: retrying the same data three times would only wait.
 */
export function jobTarget(
  job: MediaJob,
  config: WorkerConfig,
  what: string,
  accepts: (key: string) => boolean,
): MediaJobData {
  const { bucket, key } = MediaJobData.parse(job.data)
  if (!config.buckets.includes(bucket)) throw new UnrecoverableError(`bucket not served by this worker: ${bucket}`)
  if (!accepts(key)) throw new UnrecoverableError(`not ${what}: ${key}`)
  return { bucket, key }
}
