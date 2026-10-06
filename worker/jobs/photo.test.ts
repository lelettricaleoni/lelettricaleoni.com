// worker/jobs/photo.test.ts
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pino from 'pino'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JobProgress } from '@/lib/queues/schemas'
import { loadConfig } from '../config'
import { dirStore } from '../testing/dir-store'
import { makeImage } from '../testing/images'
import { MissingObjectError } from '../storage'
import { createPhotoHandler } from './photo'
import type { MediaJob } from './types'

let root: string
let workdir: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'photo-store-'))
  workdir = await mkdtemp(join(tmpdir(), 'photo-work-'))
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

async function stage(key: string, content: Buffer) {
  const file = join(root, 'b', ...key.split('/'))
  await mkdir(join(file, '..'), { recursive: true })
  await writeFile(file, content)
}

function jobFor(key: string, attemptsMade = 0) {
  const progress: object[] = []
  const job: MediaJob = {
    data: { bucket: 'b', key },
    attemptsMade,
    opts: { attempts: 3 },
    updateProgress: vi.fn(async (value: object) => { progress.push(value) }),
  }
  return { job, progress }
}

const KEY = 'private/route-photos/r1/u1.PNG'

describe('the photo handler', () => {
  it('turns a staged photo into a master, a link preview and three renditions, master last, then deletes the source', async () => {
    await stage(KEY, await makeImage({ width: 3000, height: 2000 }))
    const store = dirStore(root)
    const { job, progress } = jobFor(KEY)

    const result = await createPhotoHandler({ store, config: config(), log: quiet })(job)

    expect(store.uploads.map((u) => u.key)).toEqual([
      'public/route-photos/r1/u1.share.jpg',
      'public/route-photos/r1/u1.w1600.avif',
      'public/route-photos/r1/u1.w960.avif',
      'public/route-photos/r1/u1.w480.avif',
      'public/route-photos/r1/u1.avif', // the master goes last: its existence means "done"
    ])
    expect(store.uploads[0]).toMatchObject({ contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000, immutable' })
    expect(store.uploads[4]).toMatchObject({ contentType: 'image/avif', cacheControl: 'public, max-age=31536000, immutable' })
    expect(await store.exists('b', KEY)).toBe(false)
    expect(store.removed).toEqual([`b/${KEY}`])
    expect(result).toMatchObject({ width: 2400, height: 1600 })
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(progress.map((p) => (p as { phase: string }).phase)).toEqual(['downloading', 'transcoding', 'uploading', 'done'])
    for (const p of progress) expect(JobProgress.safeParse(p).success).toBe(true)
  })

  it('names the attempt it is on', async () => {
    await stage(KEY, await makeImage({ width: 100, height: 100 }))
    const { job, progress } = jobFor(KEY, 1)
    await createPhotoHandler({ store: dirStore(root), config: config(), log: quiet })(job)
    expect(progress[0]).toMatchObject({ attempt: 2 })
  })

  it('does not delete the source when something goes wrong before everything is uploaded', async () => {
    await stage(KEY, await makeImage({ width: 100, height: 100 }))
    const store = dirStore(root)
    const realUpload = store.upload
    store.upload = vi.fn(async (bucket, key, src, options) => {
      if (key.endsWith('u1.avif')) throw new Error('R2 hiccup') // the master, the last upload
      return realUpload(bucket, key, src, options)
    })

    await expect(createPhotoHandler({ store, config: config(), log: quiet })(jobFor(KEY).job)).rejects.toThrow('R2 hiccup')

    expect(await store.exists('b', KEY)).toBe(true)
    expect(store.removed).toEqual([])
  })

  it('treats a job whose source is already gone but whose master is there as done, without failing', async () => {
    await stage('public/route-photos/r1/u1.avif', Buffer.from('already processed'))
    const result = await createPhotoHandler({ store: dirStore(root), config: config(), log: quiet })(jobFor(KEY).job)
    expect(result).toEqual({ skipped: true })
  })

  it('fails with MissingObjectError when there is neither source nor master', async () => {
    await expect(createPhotoHandler({ store: dirStore(root), config: config(), log: quiet })(jobFor(KEY).job)).rejects.toBeInstanceOf(MissingObjectError)
  })

  it('removes a working folder left behind by an attempt that was killed, and its own when it ends', async () => {
    await stage(KEY, await makeImage({ width: 100, height: 100 }))
    const stale = join(workdir, 'b', KEY.replaceAll('/', '_'))
    await mkdir(stale, { recursive: true })
    await writeFile(join(stale, 'leftover'), 'x')

    await createPhotoHandler({ store: dirStore(root), config: config(), log: quiet })(jobFor(KEY).job)

    const { readdir } = await import('node:fs/promises')
    expect(await readdir(join(workdir, 'b')).catch(() => [])).toEqual([])
  })

  it('refuses a job whose data is not a bucket and a key', async () => {
    const job: MediaJob = { data: { nope: 1 }, attemptsMade: 0, opts: {}, updateProgress: async () => {} }
    await expect(createPhotoHandler({ store: dirStore(root), config: config(), log: quiet })(job)).rejects.toThrow()
  })
})
