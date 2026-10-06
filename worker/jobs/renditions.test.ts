// worker/jobs/renditions.test.ts
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pino from 'pino'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../config'
import { dirStore } from '../testing/dir-store'
import { createRenditionsHandler } from './renditions'
import type { MediaJob } from './types'

let root: string
let workdir: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'rend-store-'))
  workdir = await mkdtemp(join(tmpdir(), 'rend-work-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(workdir, { recursive: true, force: true })
})

const config = () =>
  loadConfig({
    APP_ENV: 'staging', REDIS_URL: 'redis://x', R2_ACCOUNT_ID: 'a', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's',
    R2_BUCKETS: 'b', WORKDIR_BASE: workdir,
  })
const quiet = pino({ level: 'silent' })
const jobFor = (key: string): MediaJob => ({ data: { bucket: 'b', key }, attemptsMade: 0, opts: {}, updateProgress: vi.fn(async () => {}) })

describe('the renditions handler', () => {
  it('cuts the renditions of a master that has none, from the largest to the smallest', async () => {
    const key = 'public/route-photos/r1/u1.avif'
    await mkdir(join(root, 'b', 'public', 'route-photos', 'r1'), { recursive: true })
    await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#336699' } })
      .avif({ quality: 65, effort: 0 })
      .toFile(join(root, 'b', ...key.split('/')))
    const store = dirStore(root)

    const size = await createRenditionsHandler({ store, config: config(), log: quiet })(jobFor(key))

    expect(size).toEqual({ width: 2400, height: 1600 })
    expect(store.uploads.map((u) => u.key)).toEqual([
      'public/route-photos/r1/u1.w1600.avif',
      'public/route-photos/r1/u1.w960.avif',
      'public/route-photos/r1/u1.w480.avif', // the smallest last: its existence means they all exist
    ])
    expect(store.removed).toEqual([]) // it only ever adds objects
  })

  it('refuses anything that is not a master, whatever ends up in its queue', async () => {
    for (const key of ['public/route-photos/r1/u1.w480.avif', 'public/route-photos/r1/u1.share.jpg', 'private/route-photos/r1/u1.jpg']) {
      await expect(createRenditionsHandler({ store: dirStore(root), config: config(), log: quiet })(jobFor(key))).rejects.toThrow(/not a master/)
    }
  })
})
