// lib/redis.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cacheKeyPrefix, getCacheRedis, getQueueRedis, redisUrl, resetRedisForTests } from './redis'

describe('redis configuration', () => {
  const saved = process.env.REDIS_URL
  beforeEach(() => { delete process.env.REDIS_URL; resetRedisForTests() })
  afterEach(() => {
    if (saved === undefined) delete process.env.REDIS_URL; else process.env.REDIS_URL = saved
    resetRedisForTests()
  })

  it('is absent without REDIS_URL, and every handle is then null: local development and CI need no Redis', () => {
    expect(redisUrl()).toBeNull()
    expect(getCacheRedis()).toBeNull()
    expect(getQueueRedis()).toBeNull()
  })

  it('treats an empty REDIS_URL as absent', () => {
    process.env.REDIS_URL = ''
    expect(redisUrl()).toBeNull()
  })

  it('prefixes cache keys with the environment, so staging and production never read each other', () => {
    expect(cacheKeyPrefix('production')).toBe('cache:production:')
    expect(cacheKeyPrefix('staging')).toBe('cache:staging:')
  })
})
