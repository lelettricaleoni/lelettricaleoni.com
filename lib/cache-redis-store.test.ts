// lib/cache-redis-store.test.ts
import { describe, expect, it } from 'vitest'
import { redisCacheStore } from './cache'

function fakeRedis() {
  const data = new Map<string, string>()
  const sets: { key: string; value: string; mode: string; ttl: number }[] = []
  return {
    sets,
    redis: {
      get: async (key: string) => data.get(key) ?? null,
      set: async (key: string, value: string, mode: 'EX', ttl: number) => {
        sets.push({ key, value, mode, ttl })
        data.set(key, value)
        return 'OK' as const
      },
    },
  }
}

describe('redisCacheStore', () => {
  it('stores values as JSON with an expiry, and reads them back parsed', async () => {
    const { redis, sets } = fakeRedis()
    const store = redisCacheStore(redis as never)
    await store.set('k', { url: 'https://x/y.m3u8', n: [1, 2] }, { ex: 600 })
    expect(sets).toEqual([{ key: 'k', value: '{"url":"https://x/y.m3u8","n":[1,2]}', mode: 'EX', ttl: 600 }])
    expect(await store.get('k')).toEqual({ url: 'https://x/y.m3u8', n: [1, 2] })
  })

  it('reads a missing key as null', async () => {
    const { redis } = fakeRedis()
    expect(await redisCacheStore(redis as never).get('nope')).toBeNull()
  })

  it('rejects on a value that is not JSON, which readThrough turns into a cache miss', async () => {
    const redis = { get: async () => 'not json', set: async () => 'OK' as const }
    await expect(redisCacheStore(redis as never).get('k')).rejects.toThrow()
  })
})
