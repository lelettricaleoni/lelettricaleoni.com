// lib/queues/overview.ts
import { readFile } from 'node:fs/promises'
import os from 'node:os'
import { settle } from '@/lib/settle'
import { QUEUE_KINDS, QUEUE_NAMES } from './names'
import { getQueue } from './queues'

/**
 * The shape of the whole worker — queue depth, what is running, the machine's own load — for the developer page.
 *
 * It used to be a snapshot the worker published every fifteen seconds. Now the site reads the queues itself, asks which
 * workers are connected, and reads load and memory from the machine, which is the same machine.
 */

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
  /** How many workers are connected to this queue right now. */
  workers: number
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

export interface HeartbeatInput {
  now: number
  cpuCount: number | null
  load: WorkerHeartbeat['load']
  memory: WorkerHeartbeat['memory']
  queues: Record<string, QueueSnapshot>
}

/** Null when no worker is connected to any queue: the page then says so instead of showing zeros. */
export function buildHeartbeat(input: HeartbeatInput): WorkerHeartbeat | null {
  const connected = Object.values(input.queues).some((queue) => queue.workers > 0)
  if (!connected) return null
  return {
    updatedAt: input.now,
    cpuCount: input.cpuCount,
    load: input.load,
    memory: input.memory,
    queues: input.queues,
    schedules: [],
  }
}

/** Linux only. Reads total and available memory from the text of /proc/meminfo (kB). */
export function parseMeminfo(text: string): { usedMb: number; totalMb: number } | null {
  const kb = (name: string) => {
    const match = new RegExp(`^${name}:\\s+(\\d+)\\s+kB`, 'm').exec(text)
    return match ? Number(match[1]) : null
  }
  const total = kb('MemTotal')
  if (total === null) return null
  const available = kb('MemAvailable') ?? total
  return { usedMb: Math.floor((total - available) / 1024), totalMb: Math.floor(total / 1024) }
}

async function hostMemory(): Promise<WorkerHeartbeat['memory']> {
  try {
    return parseMeminfo(await readFile('/proc/meminfo', 'utf8'))
  } catch {
    return null
  }
}

const OVERVIEW_TIMEOUT_MS = 2000

export async function readWorkerHeartbeat(): Promise<WorkerHeartbeat | null> {
  const loadavg = os.loadavg()
  const snapshot = await settle(
    Promise.all(
      QUEUE_KINDS.map(async (kind) => {
        const queue = getQueue(kind)
        if (!queue) return null
        const [counts, active, workers] = await Promise.all([
          queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused'),
          queue.getActive(),
          queue.getWorkers(),
        ])
        const entry: QueueSnapshot = {
          counts,
          active: active.map((job) => ({
            id: job.id ?? '',
            data: job.data,
            attempt: job.attemptsMade + 1,
            startedAt: job.processedOn ?? null,
          })),
          workers: workers.length,
        }
        return [QUEUE_NAMES[kind], entry] as const
      }),
    ),
    OVERVIEW_TIMEOUT_MS,
  )
  if (!snapshot || snapshot.some((entry) => entry === null)) return null

  return buildHeartbeat({
    now: Date.now(),
    cpuCount: os.cpus().length || null,
    load: { '1m': loadavg[0], '5m': loadavg[1], '15m': loadavg[2] },
    memory: await hostMemory(),
    queues: Object.fromEntries(snapshot as (readonly [string, QueueSnapshot])[]),
  })
}
