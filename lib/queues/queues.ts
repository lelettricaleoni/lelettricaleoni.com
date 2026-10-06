// lib/queues/queues.ts
import { Queue } from 'bullmq'
import { getQueueRedis } from '@/lib/redis'
import { QUEUE_NAMES, queuePrefix, type QueueKind } from './names'

const queues = new Map<QueueKind, Queue>()

/**
 * A queue as the site sees it: to add work and to look at it. Null without Redis, which callers treat as "nothing to
 * show / nothing to add", never as an error.
 */
export function getQueue(kind: QueueKind): Queue | null {
  const connection = getQueueRedis()
  if (!connection) return null
  let queue = queues.get(kind)
  if (!queue) {
    queue = new Queue(QUEUE_NAMES[kind], { connection, prefix: queuePrefix() })
    queue.on('error', (err) => console.error(`[queue:${kind}]`, err.message))
    queues.set(kind, queue)
  }
  return queue
}
