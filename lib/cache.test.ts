import { describe, it, expect, vi } from 'vitest'
import { readThrough, type CacheStore } from './cache'

/** A store that remembers what it was told, for asserting writes. */
function fakeStore(initial: Record<string, unknown> = {}) {
  const data = new Map(Object.entries(initial))
  const writes: Array<{ key: string; value: unknown; ex: number }> = []
  const store: CacheStore = {
    async get<T>(key: string) {
      return (data.has(key) ? (data.get(key) as T) : null)
    },
    async set(key, value, opts) {
      writes.push({ key, value, ex: opts.ex })
      data.set(key, value)
      return 'OK'
    },
  }
  return { store, writes }
}

describe('readThrough', () => {
  it('runs the producer and returns its value when there is no store', async () => {
    const produce = vi.fn(async () => 'fresco')
    const value = await readThrough('k', produce, 60, null)
    expect(value).toBe('fresco')
    expect(produce).toHaveBeenCalledOnce()
  })

  it('returns the cached value without running the producer', async () => {
    const { store } = fakeStore({ k: 'in cache' })
    const produce = vi.fn(async () => 'fresco')
    expect(await readThrough('k', produce, 60, store)).toBe('in cache')
    expect(produce).not.toHaveBeenCalled()
  })

  it('caches what the producer returns, with the given ttl', async () => {
    const { store, writes } = fakeStore()
    await readThrough('k', async () => 'fresco', 120, store)
    expect(writes).toEqual([{ key: 'k', value: 'fresco', ex: 120 }])
  })

  it('lets the ttl depend on the produced value', async () => {
    const { store, writes } = fakeStore()
    // "not ready" is re-checked in seconds; a real value is kept for a week
    const ttl = (v: string | null) => (v === null ? 20 : 604800)
    await readThrough<string | null>('ready', async () => 'url', ttl, store)
    expect(writes[0].ex).toBe(604800)
  })

  it('never caches null, so "nothing yet" is not remembered for a week', async () => {
    const { store, writes } = fakeStore()
    const value = await readThrough<string | null>('k', async () => null, 604800, store)
    expect(value).toBeNull()
    expect(writes).toEqual([])
  })

  describe('fail open', () => {
    it('falls through to the producer when the read throws', async () => {
      const store: CacheStore = {
        get: async () => { throw new Error('Upstash giù') },
        set: async () => 'OK',
      }
      expect(await readThrough('k', async () => 'fresco', 60, store)).toBe('fresco')
    })

    it('falls through to the producer when the read hangs', async () => {
      const store: CacheStore = {
        get: () => new Promise(() => { /* mai risolta */ }),
        set: async () => 'OK',
      }
      const started = Date.now()
      expect(await readThrough('k', async () => 'fresco', 60, store)).toBe('fresco')
      // il timeout è 250ms: senza di esso questo test non finirebbe mai
      expect(Date.now() - started).toBeLessThan(2000)
    })

    it('still returns the value when the write throws', async () => {
      const store: CacheStore = {
        get: async () => null,
        set: async () => { throw new Error('sola lettura') },
      }
      expect(await readThrough('k', async () => 'fresco', 60, store)).toBe('fresco')
    })
  })
})
