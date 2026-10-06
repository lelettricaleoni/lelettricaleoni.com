// worker/config.test.ts
import { describe, expect, it } from 'vitest'
import { loadConfig } from './config'

const valid = {
  APP_ENV: 'staging',
  REDIS_URL: 'redis://worker:secret@redis:6379',
  R2_ACCOUNT_ID: 'acct',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKETS: 'dev-lelettrica-trails',
}

describe('loadConfig', () => {
  it('reads a valid environment and fills in the defaults', () => {
    const config = loadConfig(valid)
    expect(config).toMatchObject({
      appEnv: 'staging',
      redisUrl: 'redis://worker:secret@redis:6379',
      r2: { accountId: 'acct', accessKeyId: 'key', secretAccessKey: 'secret' },
      buckets: ['dev-lelettrica-trails'],
      workdirBase: '/tmp/work',
      scanIntervalS: 600,
      imaging: { maxEdge: 2400, quality: 65, effort: 3, shareEdge: 1200, shareQuality: 82 },
    })
  })

  it('splits and trims a list of buckets', () => {
    expect(loadConfig({ ...valid, R2_BUCKETS: ' a , b ,, ' }).buckets).toEqual(['a', 'b'])
  })

  it('takes the imaging settings from the environment', () => {
    const config = loadConfig({ ...valid, IMAGE_QUALITY: '70', IMAGE_EFFORT: '4', IMAGE_MAX_EDGE: '3000' })
    expect(config.imaging).toMatchObject({ quality: 70, effort: 4, maxEdge: 3000 })
  })

  it('names the variable that is missing', () => {
    const { REDIS_URL, ...rest } = valid
    void REDIS_URL
    expect(() => loadConfig(rest)).toThrow(/REDIS_URL/)
  })

  it('refuses an environment that is neither production nor staging', () => {
    expect(() => loadConfig({ ...valid, APP_ENV: 'development' })).toThrow(/APP_ENV/)
  })

  it('refuses an empty list of buckets', () => {
    expect(() => loadConfig({ ...valid, R2_BUCKETS: ' , ' })).toThrow(/R2_BUCKETS/)
  })
})
