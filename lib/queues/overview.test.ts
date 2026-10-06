// lib/queues/overview.test.ts
import { describe, expect, it } from 'vitest'
import { buildHeartbeat, parseMeminfo } from './overview'
import { countJobs } from './counts'

const queue = (workers: number, active = 0) => ({
  counts: { waiting: 1, active },
  active: active ? [{ id: 'b/private/route-videos/r/u.mp4', data: { bucket: 'b' }, attempt: 1, startedAt: 5 }] : [],
  workers,
})

describe('buildHeartbeat', () => {
  const base = { now: 1000, cpuCount: 2, load: { '1m': 0.5 }, memory: { usedMb: 100, totalMb: 4000 } }

  it('describes the worker when at least one queue has a worker connected', () => {
    const heartbeat = buildHeartbeat({ ...base, queues: { 'video-transcode': queue(1, 1), 'image-process': queue(0) } })
    expect(heartbeat).toMatchObject({ updatedAt: 1000, cpuCount: 2, schedules: [] })
    expect(Object.keys(heartbeat!.queues)).toEqual(['video-transcode', 'image-process'])
  })

  it('says nothing when no worker is connected: the panel then says there is no worker', () => {
    expect(buildHeartbeat({ ...base, queues: { 'video-transcode': queue(0), 'image-process': queue(0) } })).toBeNull()
  })
})

describe('parseMeminfo', () => {
  it('reads total and available memory from /proc/meminfo', () => {
    const text = 'MemTotal:       16384000 kB\nMemFree:         1000000 kB\nMemAvailable:    8192000 kB\n'
    expect(parseMeminfo(text)).toEqual({ usedMb: 8000, totalMb: 16000 })
  })

  it('returns null for text that is not meminfo', () => {
    expect(parseMeminfo('nope')).toBeNull()
  })
})

describe('countJobs', () => {
  it('adds up every count of every queue, treating a queue that did not answer as empty', () => {
    expect(countJobs([{ waiting: 2, active: 1 }, null, { failed: 3 }])).toBe(6)
    expect(countJobs([])).toBe(0)
  })
})
