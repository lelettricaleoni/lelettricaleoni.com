import { getStore, CACHE_TIMEOUT_MS, type CacheStore } from './cache'

/**
 * Where a video is in transcoding, as reported by the worker.
 *
 * The site used to infer this from the existence of a manifest — a yes/no that
 * could not tell "still working" from "storage unreachable", and made a failure
 * invisible. The worker now says so itself.
 *
 * It writes these keys straight into Upstash, under an ACL user that may only
 * SET keys beginning `videojob:` and cannot read anything, so the site offers
 * it no endpoint at all. **The key shape and the TTLs below are a contract with
 * worker.py in lelettricaleoni/videoStream-bucketWorker**: change one and you
 * must change the other. Nothing here trusts what comes back — parseStatus
 * treats it as foreign input, because that is what it is.
 */

export const VIDEO_JOB_PHASES = ['queued', 'downloading', 'transcoding', 'uploading', 'done', 'failed'] as const
export type VideoJobPhase = (typeof VIDEO_JOB_PHASES)[number]

export interface VideoJobStatus {
  phase: VideoJobPhase
  /** 0-100 while transcoding; absent in phases that have no measurable middle. */
  progress?: number
  attempt?: number
  error?: string
  /** Epoch milliseconds, so a stale entry can be recognised as stale. */
  updatedAt: number
}

/**
 * How long a status outlives its last update.
 *
 * Long enough to survive a slow transcode with no progress line, short enough
 * that a worker killed mid-job stops claiming the video is on its way.
 */
export const JOB_TTL_S = 2 * 60 * 60

/** A finished job is kept only long enough for the panel to notice. */
export const DONE_TTL_S = 5 * 60

export function jobKey(storageKey: string): string {
  return `videojob:v1:${storageKey}`
}

/** Reject anything that is not a status the worker wrote, without throwing. */
export function parseStatus(value: unknown): VideoJobStatus | null {
  // The worker sends a JSON string over the REST API. The Upstash client
  // usually parses it on the way back, but whether it does is its business,
  // not a thing to depend on across two repositories.
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (typeof v.phase !== 'string' || !VIDEO_JOB_PHASES.includes(v.phase as VideoJobPhase)) return null
  return {
    phase: v.phase as VideoJobPhase,
    progress: typeof v.progress === 'number' ? Math.max(0, Math.min(100, Math.round(v.progress))) : undefined,
    attempt: typeof v.attempt === 'number' ? v.attempt : undefined,
    error: typeof v.error === 'string' ? v.error.slice(0, 500) : undefined,
    updatedAt: typeof v.updatedAt === 'number' ? v.updatedAt : Date.now(),
  }
}

/** Resolve with null instead of hanging or throwing — see lib/cache.ts. */
async function settle<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), ms) }),
    ])
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function readJobStatus(
  storageKey: string,
  store: CacheStore | null = getStore()
): Promise<VideoJobStatus | null> {
  if (!store) return null
  return parseStatus(await settle(store.get(jobKey(storageKey)), CACHE_TIMEOUT_MS))
}
