// lib/redis.ts
import { Redis, type RedisOptions } from 'ioredis'
import { appEnv } from '@/lib/app-env'

/**
 * The site's connections to the VM's Redis. REDIS_URL unset means "no Redis" — local development and CI — and every
 * caller treats that as a no-op, never as an error.
 *
 * Both connections fail fast once they have been connected: with no offline queue a command sent while Redis is
 * unreachable rejects at once instead of piling up, and the callers (lib/cache.ts, lib/queues/) already turn a rejection
 * into "carry on without". Until the first connection the queue is on, so the first request after a start waits the few
 * milliseconds the connection takes instead of losing its cache (and the first read of the developer page).
 */
export function redisUrl(): string | null {
  return process.env.REDIS_URL || null
}

const FAIL_FAST = { maxRetriesPerRequest: 1, connectTimeout: 1500 } as const

function connect(url: string, options: RedisOptions = {}): Redis {
  const redis = new Redis(url, { ...FAIL_FAST, enableOfflineQueue: true, ...options })
  // ioredis reads this at every command, so it can be turned off once there is a connection to lose.
  redis.once('ready', () => {
    redis.options.enableOfflineQueue = false
  })
  return redis
}

/** One Redis serves every environment, so cache keys carry the environment's name. */
export function cacheKeyPrefix(env: string = appEnv()): string {
  return `cache:${env}:`
}

let cacheRedis: Redis | null | undefined
export function getCacheRedis(): Redis | null {
  if (cacheRedis !== undefined) return cacheRedis
  const url = redisUrl()
  cacheRedis = url ? connect(url, { keyPrefix: cacheKeyPrefix() }) : null
  cacheRedis?.on('error', (err) => console.error('[redis] cache connection:', err.message))
  return cacheRedis
}

let queueRedis: Redis | null | undefined
/** Shared by the site's BullMQ queues, which keep their own key prefix: so no `keyPrefix` here. */
export function getQueueRedis(): Redis | null {
  if (queueRedis !== undefined) return queueRedis
  const url = redisUrl()
  queueRedis = url ? connect(url) : null
  queueRedis?.on('error', (err) => console.error('[redis] queue connection:', err.message))
  return queueRedis
}

/** Drop the resolved connections. Exists for tests. */
export function resetRedisForTests(): void {
  cacheRedis = undefined
  queueRedis = undefined
}
