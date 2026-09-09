import { Redis } from '@upstash/redis'

/**
 * Read-through cache on Upstash Redis.
 *
 * Every page here renders on demand, so work that could be done once per video
 * or per GPX file is currently redone on every request. This caches the results
 * that never change once produced.
 *
 * Three rules, all of them consequences of the same incident: a feature-flag
 * migration put an external service on the critical path of every request with
 * no bound, and made the home page forty times slower.
 *
 * 1. **Unconfigured is fine.** With no credentials the cache is a no-op and the
 *    caller does its normal work. Local development and CI need no Redis.
 * 2. **Fail open.** A cache error, or a slow one, never fails a request and
 *    never propagates — the caller falls through to the real source.
 * 3. **Bounded.** No cache call may hold a request for longer than
 *    CACHE_TIMEOUT_MS, whatever Upstash is doing.
 */

/** No visitor waits longer than this for a cache lookup. */
export const CACHE_TIMEOUT_MS = 250

/** The slice of Redis this module uses, so tests can supply their own. */
export interface CacheStore {
  get<T>(key: string): Promise<T | null>
  set(key: string, value: unknown, opts: { ex: number }): Promise<unknown>
}

let resolved: CacheStore | null | undefined

/** The configured store, or null when there are no credentials. */
export function getStore(): CacheStore | null {
  if (resolved !== undefined) return resolved
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  resolved = url && token ? (new Redis({ url, token }) as unknown as CacheStore) : null
  if (!resolved) {
    console.info('[cache] UPSTASH_REDIS_REST_URL/TOKEN not set — caching disabled')
  }
  return resolved
}

/** Resolve with null instead of hanging or throwing. */
async function settle<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms)
      }),
    ])
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Return the cached value for `key`, or run `produce` and cache what it
 * returns.
 *
 * `ttlSeconds` may depend on the produced value — a video that is still
 * transcoding should be re-checked in seconds, while one that is ready never
 * changes again.
 *
 * A produced value of `null` or `undefined` is never cached: callers use it to
 * mean "nothing here yet", and remembering that for a week would hide a video
 * for a week.
 */
export async function readThrough<T>(
  key: string,
  produce: () => Promise<T>,
  ttlSeconds: number | ((value: T) => number),
  store: CacheStore | null = getStore()
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
