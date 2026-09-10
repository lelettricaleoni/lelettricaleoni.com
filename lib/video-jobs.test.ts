import { describe, it, expect } from 'vitest'
import {
  jobKey, parseStatus, readJobStatus, type VideoJobStatus,
} from './video-jobs'
import type { CacheStore } from './cache'

function fakeStore(initial: Record<string, unknown> = {}) {
  const data = new Map(Object.entries(initial))
  const sets: { key: string; value: unknown; ex: number }[] = []
  const store: CacheStore = {
    get: async <T,>(key: string) => (data.get(key) ?? null) as T | null,
    set: async (key, value, opts) => {
      sets.push({ key, value, ex: opts.ex })
      data.set(key, value)
      return 'OK'
    },
  }
  return { store, sets }
}

describe('jobKey', () => {
  it('namespaces and versions the key', () => {
    expect(jobKey('private/route-videos/a/b.mp4')).toBe('videojob:v1:private/route-videos/a/b.mp4')
  })
})

describe('parseStatus', () => {
  it('parses the JSON string the worker writes over REST', () => {
    const s = parseStatus('{"phase":"transcoding","progress":45,"updatedAt":2}')
    expect(s).toMatchObject({ phase: 'transcoding', progress: 45 })
  })

  it('rejects a string that is not JSON', () => {
    expect(parseStatus('non json')).toBeNull()
  })

  it('rejects anything that is not a status the worker wrote', () => {
    expect(parseStatus(null)).toBeNull()
    expect(parseStatus('transcoding')).toBeNull()
    expect(parseStatus({})).toBeNull()
    expect(parseStatus({ phase: 'inventata' })).toBeNull()
  })

  it('keeps the fields it recognises', () => {
    const s = parseStatus({ phase: 'transcoding', progress: 42, attempt: 2, updatedAt: 1000 })
    expect(s).toMatchObject({ phase: 'transcoding', progress: 42, attempt: 2, updatedAt: 1000 })
  })

  it('clamps progress to a percentage', () => {
    expect(parseStatus({ phase: 'transcoding', progress: 140 })?.progress).toBe(100)
    expect(parseStatus({ phase: 'transcoding', progress: -5 })?.progress).toBe(0)
    expect(parseStatus({ phase: 'transcoding', progress: 33.7 })?.progress).toBe(34)
  })

  it('truncates an error instead of storing whatever arrives', () => {
    const s = parseStatus({ phase: 'failed', error: 'x'.repeat(900) })
    expect(s?.error).toHaveLength(500)
  })

  it('stamps a missing updatedAt so nothing looks infinitely fresh', () => {
    const before = Date.now()
    expect(parseStatus({ phase: 'queued' })!.updatedAt).toBeGreaterThanOrEqual(before)
  })
})

describe('readJobStatus', () => {
  it('returns what was stored', async () => {
    const stored: VideoJobStatus = { phase: 'uploading', progress: 99, updatedAt: 5 }
    const { store } = fakeStore({ 'videojob:v1:k': stored })
    expect(await readJobStatus('k', store)).toMatchObject({ phase: 'uploading', progress: 99 })
  })

  it('returns null without a store, instead of failing the panel', async () => {
    expect(await readJobStatus('k', null)).toBeNull()
  })

  it('survives a store that throws', async () => {
    const store: CacheStore = {
      get: async () => { throw new Error('redis giù') },
      set: async () => 'OK',
    }
    expect(await readJobStatus('k', store)).toBeNull()
  })
})
