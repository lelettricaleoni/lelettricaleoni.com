import { describe, it, expect } from 'vitest'
import { HEARTBEAT_KEY, parseHeartbeat, readWorkerHeartbeat } from './worker-heartbeat'
import type { CacheStore } from './cache'

function fakeStore(initial: Record<string, unknown> = {}): CacheStore {
  const data = new Map(Object.entries(initial))
  return {
    get: async <T,>(key: string) => (data.get(key) ?? null) as T | null,
    set: async () => 'OK',
  }
}

const validSnapshot = {
  updatedAt: 1000,
  cpuCount: 2,
  load: { '1m': 0.5, '5m': 0.3, '15m': 0.1 },
  memory: { usedMb: 512, totalMb: 2048 },
  queues: {
    'video-transcode': {
      counts: { waiting: 2, active: 1, completed: 40, failed: 1, delayed: 0 },
      active: [{ id: 'bucket/key.mp4', data: { key: 'private/route-videos/a/b.mp4' }, attempt: 1, startedAt: 900 }],
    },
  },
  schedules: [{ id: 'booking-reminders', queue: 'reminders', pattern: '0 9 * * *' }],
}

describe('parseHeartbeat', () => {
  it('parses the JSON string the worker writes over REST', () => {
    expect(parseHeartbeat(JSON.stringify(validSnapshot))).toMatchObject({
      updatedAt: 1000,
      cpuCount: 2,
    })
  })

  it('rejects a string that is not JSON', () => {
    expect(parseHeartbeat('non json')).toBeNull()
  })

  it('rejects anything without a numeric updatedAt', () => {
    expect(parseHeartbeat(null)).toBeNull()
    expect(parseHeartbeat({})).toBeNull()
    expect(parseHeartbeat({ updatedAt: 'now' })).toBeNull()
  })

  it('reads queue counts and active jobs', () => {
    const h = parseHeartbeat(validSnapshot)!
    expect(h.queues['video-transcode'].counts).toMatchObject({ waiting: 2, active: 1 })
    expect(h.queues['video-transcode'].active).toEqual([
      { id: 'bucket/key.mp4', data: { key: 'private/route-videos/a/b.mp4' }, attempt: 1, startedAt: 900 },
    ])
  })

  it('drops an active job with no id instead of throwing', () => {
    const h = parseHeartbeat({
      updatedAt: 1,
      queues: { q: { counts: {}, active: [{ data: {} }, { id: 'ok' }] } },
    })!
    expect(h.queues.q.active.map((j) => j.id)).toEqual(['ok'])
  })

  it('reads schedules, dropping anything malformed', () => {
    const h = parseHeartbeat({
      updatedAt: 1,
      schedules: [{ id: 'a', queue: 'q', pattern: '* * * * *' }, { id: 'missing-fields' }],
    })!
    expect(h.schedules).toEqual([{ id: 'a', queue: 'q', pattern: '* * * * *' }])
  })

  it('treats missing pieces as absent rather than crashing', () => {
    const h = parseHeartbeat({ updatedAt: 1 })!
    expect(h).toMatchObject({ cpuCount: null, memory: null, queues: {}, schedules: [] })
    expect(h.load).toEqual({ '1m': undefined, '5m': undefined, '15m': undefined })
  })
})

describe('readWorkerHeartbeat', () => {
  it('returns what was stored under the contract key', async () => {
    const store = fakeStore({ [HEARTBEAT_KEY]: validSnapshot })
    expect(await readWorkerHeartbeat(store)).toMatchObject({ updatedAt: 1000 })
  })

  it('returns null without a store, instead of failing the page', async () => {
    expect(await readWorkerHeartbeat(null)).toBeNull()
  })

  it('survives a store that throws', async () => {
    const store: CacheStore = {
      get: async () => { throw new Error('redis giù') },
      set: async () => 'OK',
    }
    expect(await readWorkerHeartbeat(store)).toBeNull()
  })
})
