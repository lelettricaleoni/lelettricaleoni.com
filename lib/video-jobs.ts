import { PHOTO_STAGING_PREFIXES, VIDEO_STAGING_PREFIXES } from './media/keys'
import { JOB_PHASES } from './queues/schemas'

/**
 * Where a video or a photo is in processing, as reported by the media worker through the queue (lib/queues/status.ts).
 *
 * The site used to infer this from the existence of a manifest — a yes/no that could not tell "still working" from
 * "storage unreachable", and made a failure invisible. It now asks the queue, which knows the state, the progress and
 * the reason of a failure, and the shape here is the one the panel has always read.
 *
 * Photos are reported through here too, with the same phases (`transcoding` included, for a photo being encoded).
 */
export const VIDEO_JOB_PHASES = JOB_PHASES
export type VideoJobPhase = (typeof VIDEO_JOB_PHASES)[number]

export interface VideoJobStatus {
  phase: VideoJobPhase
  /** 0-100 while transcoding; absent in phases that have no measurable middle. */
  progress?: number
  attempt?: number
  error?: string
  /** Epoch milliseconds, so a stale entry can be recognised as stale. */
  updatedAt: number
  /** Set once, alongside `phase: 'done'` — the source file's SHA-256, computed by the worker before deleting it. */
  sha256?: string
}

/** Storage keys the worker reports on: what it takes from staging and turns into something playable or viewable. */
export const TRACKED_JOB_PREFIXES = [...VIDEO_STAGING_PREFIXES, ...PHOTO_STAGING_PREFIXES] as const

export function isTrackedJobKey(key: unknown): key is string {
  return typeof key === 'string' && TRACKED_JOB_PREFIXES.some((prefix) => key.startsWith(prefix))
}
