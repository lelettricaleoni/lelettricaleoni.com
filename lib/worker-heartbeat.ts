import { getStore, CACHE_TIMEOUT_MS, type CacheStore } from './cache'

/**
 * The shape of the whole worker — queue depth, what's running, the host's
 * own load — as published by heartbeat.py in lelettricaleoni/videoStream-
 * bucketWorker. Same channel as lib/video-jobs.ts, same rule: this is
 * foreign input from another repository, never trusted at face value.
 *
 * **The key and the field names are a contract with heartbeat.py.** Change
 * one and you must change the other.
 */

export const HEARTBEAT_KEY = 'videojob:v1:__worker__'

export interface QueueCounts {
  waiting?: number
  active?: number
  completed?: number
  failed?: number
  delayed?: number
  [status: string]: number | undefined
}

export interface ActiveJob {
  id: string
  data: unknown
  attempt: number
  /** Epoch milliseconds the job started running, or null if unavailable. */
  startedAt: number | null
}

export interface QueueSnapshot {
  counts: QueueCounts
  active: ActiveJob[]
}

export interface Schedule {
  id: string
  queue: string
  pattern: string
}

export interface WorkerHeartbeat {
  updatedAt: number
  cpuCount: number | null
  load: { '1m'?: number; '5m'?: number; '15m'?: number }
  memory: { usedMb: number; totalMb: number } | null
  queues: Record<string, QueueSnapshot>
  schedules: Schedule[]
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function parseQueueCounts(v: unknown): QueueCounts {
  if (!isRecord(v)) return {}
  const out: QueueCounts = {}
  for (const [key, val] of Object.entries(v)) {
    if (typeof val === 'number') out[key] = val
  }
  return out
}

function parseActiveJob(v: unknown): ActiveJob | null {
  if (!isRecord(v) || typeof v.id !== 'string') return null
  return {
    id: v.id,
    data: v.data,
    attempt: typeof v.attempt === 'number' ? v.attempt : 0,
    startedAt: typeof v.startedAt === 'number' ? v.startedAt : null,
  }
}

function parseQueues(v: unknown): Record<string, QueueSnapshot> {
  if (!isRecord(v)) return {}
  const out: Record<string, QueueSnapshot> = {}
  for (const [name, snapshot] of Object.entries(v)) {
    if (!isRecord(snapshot)) continue
    out[name] = {
      counts: parseQueueCounts(snapshot.counts),
      active: Array.isArray(snapshot.active)
        ? snapshot.active.map(parseActiveJob).filter((j): j is ActiveJob => j !== null)
        : [],
    }
  }
  return out
}

function parseSchedules(v: unknown): Schedule[] {
  if (!Array.isArray(v)) return []
  return v
    .filter(isRecord)
    .filter((s): s is Record<string, unknown> & { id: string; queue: string; pattern: string } =>
      typeof s.id === 'string' && typeof s.queue === 'string' && typeof s.pattern === 'string'
    )
    .map((s) => ({ id: s.id, queue: s.queue, pattern: s.pattern }))
}

function parseMemory(v: unknown): { usedMb: number; totalMb: number } | null {
  if (!isRecord(v) || typeof v.usedMb !== 'number' || typeof v.totalMb !== 'number') return null
  return { usedMb: v.usedMb, totalMb: v.totalMb }
}

export function parseHeartbeat(value: unknown): WorkerHeartbeat | null {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (!isRecord(value) || typeof value.updatedAt !== 'number') return null

  const load = isRecord(value.load) ? value.load : {}
  return {
    updatedAt: value.updatedAt,
    cpuCount: typeof value.cpuCount === 'number' ? value.cpuCount : null,
    load: {
      '1m': typeof load['1m'] === 'number' ? load['1m'] : undefined,
      '5m': typeof load['5m'] === 'number' ? load['5m'] : undefined,
      '15m': typeof load['15m'] === 'number' ? load['15m'] : undefined,
    },
    memory: parseMemory(value.memory),
    queues: parseQueues(value.queues),
    schedules: parseSchedules(value.schedules),
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

export async function readWorkerHeartbeat(
  store: CacheStore | null = getStore()
): Promise<WorkerHeartbeat | null> {
  if (!store) return null
  return parseHeartbeat(await settle(store.get(HEARTBEAT_KEY), CACHE_TIMEOUT_MS))
}
