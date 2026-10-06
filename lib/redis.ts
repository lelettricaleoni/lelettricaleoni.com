// lib/redis.ts
import { Redis } from 'ioredis'
import { appEnv } from '@/lib/app-env'

/**
 * The site's connections to the VM's Redis. REDIS_URL unset means "no Redis" — local development and CI — and every
 * caller treats that as a no-op, never as an error.
 *
 * Both connections fail fast: with no offline queue a command sent while Redis is unreachable rejects at once instead
 * of piling up, and the callers (lib/cache.ts, lib/queues/) already turn a rejection into "carry on without".
 */
export function redisUrl(): string | null {
  return process.env.REDIS_URL || null
}

const FAIL_FAST = { maxRetriesPerRequest: 1, enableOfflineQueue: false, connectTimeout: 1500 } as const

/** One Redis serves every environment, so cache keys carry the environment's name. */
export function cacheKeyPrefix(env: string = appEnv()): string {
  return `cache:${env}:`
}

let cacheRedis: Redis | null | undefined
export function getCacheRedis(): Redis | null {
  if (cacheRedis !== undefined) return cacheRedis
  const url = redisUrl()
  cacheRedis = url ? new Redis(url, { ...FAIL_FAST, keyPrefix: cacheKeyPrefix() }) : null
  cacheRedis?.on('error', (err) => console.error('[redis] cache connection:', err.message))
  return cacheRedis
}

let queueRedis: Redis | null | undefined
/** Shared by the site's BullMQ queues, which keep their own key prefix: so no `keyPrefix` here. */
export function getQueueRedis(): Redis | null {
  if (queueRedis !== undefined) return queueRedis
  const url = redisUrl()
  queueRedis = url ? new Redis(url, FAIL_FAST) : null
  queueRedis?.on('error', (err) => console.error('[redis] queue connection:', err.message))
  return queueRedis
}

/** Drop the resolved connections. Exists for tests. */
export function resetRedisForTests(): void {
  cacheRedis = undefined
  queueRedis = undefined
}
