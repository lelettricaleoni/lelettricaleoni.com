// worker/runtime.ts
import { Queue, Worker, type ConnectionOptions, type Processor } from 'bullmq'
import { QUEUE_KINDS, QUEUE_NAMES, type QueueKind } from '@/lib/queues/names'
import type { Logger } from './logger'

export function createQueues(connection: ConnectionOptions, prefix: string): Record<QueueKind, Queue> {
  return Object.fromEntries(QUEUE_KINDS.map((kind) => [kind, new Queue(QUEUE_NAMES[kind], { connection, prefix })])) as Record<QueueKind, Queue>
}

export type Handlers = Record<QueueKind, Processor>

/**
 * One worker per queue, one job at a time each, deliberately: the machine has two cores and transcoding uses both; a
 * second job alongside would make every job slower rather than the batch faster. The lock lasts two minutes because ffmpeg
 * and sharp run outside the event loop's way, so the lock is renewed all the same.
 */
export function startWorkers(
  connection: ConnectionOptions,
  prefix: string,
  handlers: Handlers,
  log: Logger,
): Record<QueueKind, Worker> {
  const workers = {} as Record<QueueKind, Worker>
  for (const kind of QUEUE_KINDS) {
    const queue = QUEUE_NAMES[kind]
    const worker = new Worker(queue, handlers[kind], { connection, prefix, concurrency: 1, lockDuration: 120_000 })
    worker.on('failed', (job, err) =>
      log.error({ queue, jobId: job?.id, attempt: job?.attemptsMade, err: err.message }, 'job failed'),
    )
    worker.on('error', (err) => log.error({ queue, err: err.message }, 'worker error'))
    workers[kind] = worker
  }
  return workers
}
