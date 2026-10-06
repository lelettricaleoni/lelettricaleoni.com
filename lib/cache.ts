import type { Redis } from 'ioredis'
import { getCacheRedis } from '@/lib/redis'
import { settle } from '@/lib/settle'

/**
 * Read-through cache on the VM's Redis.
 *
 * Every page here renders on demand, so work that could be done once per video or per GPX file would otherwise be redone
 * on every request. This caches the results that never change once produced.
 *
 * Three rules, all of them consequences of the same incident: a feature-flag migration put an external service on the
 * critical path of every request with no bound, and made the home page forty times slower.
 *
 * 1. **Unconfigured is fine.** With no REDIS_URL the cache is a no-op and the caller does its normal work. Local
 *    development and CI need no Redis.
 * 2. **Fail open.** A cache error, or a slow one, never fails a request and never propagates — the caller falls through
 *    to the real source.
 * 3. **Bounded.** No cache call may hold a request for longer than CACHE_TIMEOUT_MS, whatever Redis is doing.
 */

/** No visitor waits longer than this for a cache lookup. */
export const CACHE_TIMEOUT_MS = 250

/** The slice of Redis this module uses, so tests can supply their own. */
export interface CacheStore {
  get<T>(key: string): Promise<T | null>
  set(key: string, value: unknown, opts: { ex: number }): Promise<unknown>
}

/**
 * A CacheStore over an ioredis connection. Values go in as JSON and come back parsed; a value that is not JSON makes
 * `get` reject, which readThrough treats as a miss.
 */
export function redisCacheStore(redis: Pick<Redis, 'get' | 'set'>): CacheStore {
  return {
    async get<T>(key: string): Promise<T | null> {
      const raw = await redis.get(key)
      return raw === null ? null : (JSON.parse(raw) as T)
    },
    set: (key, value, { ex }) => redis.set(key, JSON.stringify(value), 'EX', ex),
  }
}

let resolved: CacheStore | null | undefined

/** The configured store, or null when there is no Redis. */
export function getStore(): CacheStore | null {
  if (resolved !== undefined) return resolved
  const redis = getCacheRedis()
  resolved = redis ? redisCacheStore(redis) : null
  if (!resolved) console.info('[cache] REDIS_URL not set — caching disabled')
  return resolved
}

/**
 * Return the cached value for `key`, or run `produce` and cache what it returns.
 *
 * `ttlSeconds` may depend on the produced value — a video that is still transcoding should be re-checked in seconds,
 * while one that is ready never changes again.
 *
 * A produced value of `null` or `undefined` is never cached: callers use it to mean "nothing here yet", and remembering
 * that for a week would hide a video for a week.
 */
export async function readThrough<T>(
  key: string,
  produce: () => Promise<T>,
  ttlSeconds: number | ((value: T) => number),
  store: CacheStore | null = getStore(),
): Promise<T> {
  if (store) {
    const hit = await settle(store.get<T>(key), CACHE_TIMEOUT_MS)
    if (hit !== null && hit !== undefined) return hit
  }

  const value = await produce()

  if (store && value !== null && value !== undefined) {
    const ttl = typeof ttlSeconds === 'function' ? ttlSeconds(value) : ttlSeconds
    if (ttl > 0) {
      // Not awaited beyond its bound: writing the cache must not delay the response
      void settle(store.set(key, value, { ex: ttl }), CACHE_TIMEOUT_MS)
    }
  }

  return value
}

/** Drop the resolved store. Exists for tests. */
export function resetStoreForTests(): void {
  resolved = undefined
}
