// Needs a real Redis. Skipped without REDIS_URL; CI provides one (job `worker`).
import { afterEach, describe, expect, it } from 'vitest'
import { getCacheRedis, getQueueRedis, resetRedisForTests } from '@/lib/redis'

describe.skipIf(!process.env.REDIS_URL)('the first command on a fresh connection, with a real Redis', () => {
  afterEach(() => {
    getCacheRedis()?.disconnect()
    getQueueRedis()?.disconnect()
    resetRedisForTests()
  })

  it('waits for the connection instead of failing: the first request after a start must not lose its cache', async () => {
    resetRedisForTests()
    const redis = getCacheRedis()!
    // No time to connect has passed: this is the call that failed with "Stream isn't writeable".
    await expect(redis.dbsize()).resolves.toEqual(expect.any(Number))
  })

  it('fails at once, instead of queueing, once it has been connected: an outage must not pile commands up', async () => {
    resetRedisForTests()
    const redis = getQueueRedis()!
    await redis.ping()
    expect(redis.options.enableOfflineQueue).toBe(false)
  })
})
