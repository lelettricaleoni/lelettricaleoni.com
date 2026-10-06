// lib/queues/names.ts
import { appEnv } from '@/lib/app-env'

/** The three queues, under the names the Python worker used, so a queue can be handed over without renaming anything. */
export const QUEUE_NAMES = {
  video: 'video-transcode',
  photo: 'image-process',
  renditions: 'image-renditions',
} as const

export type QueueKind = keyof typeof QUEUE_NAMES
export const QUEUE_KINDS = Object.keys(QUEUE_NAMES) as QueueKind[]

/** The name BullMQ gives a job of each queue; it only shows up in logs and in the queue's own bookkeeping. */
export const JOB_NAMES: Record<QueueKind, string> = {
  video: 'transcode',
  photo: 'process',
  renditions: 'render',
}

/**
 * One Redis serves every environment, so each gets its own key prefix: a staging worker never takes a production
 * job (it would not have that job's bucket) and the other way round.
 */
export function queuePrefix(env: string = appEnv()): string {
  return `bullmq-${env}`
}
