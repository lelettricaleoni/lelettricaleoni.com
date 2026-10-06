// worker/scan.test.ts
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Queue } from 'bullmq'
import pino from 'pino'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueueKind } from '@/lib/queues/names'
import { findPending, scanOnce, startScanner } from './scan'
import type { ObjectStore } from './storage'
import { dirStore } from './testing/dir-store'

let root: string
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'scan-')) })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

const quiet = pino({ level: 'silent' })

async function put(key: string, bucket = 'b') {
  const file = join(root, bucket, ...key.split('/'))
  await mkdir(join(file, '..'), { recursive: true })
  await writeFile(file, 'x')
}

describe('findPending', () => {
  it('finds videos in both staging folders that have no stream beside them, whatever the case of the extension', async () => {
    await put('private/route-videos/r1/u1.mp4')
    await put('private/bike-model-videos/m1/u2.MP4')
    await put('private/route-videos/r1/notes.txt')
    const found = await findPending(dirStore(root), ['b'], quiet)
    expect(found.map((job) => job.key).sort()).toEqual([
      'private/bike-model-videos/m1/u2.MP4',
      'private/route-videos/r1/u1.mp4',
    ])
    expect(found.every((job) => job.kind === 'video')).toBe(true)
  })

  it('skips a video that already has its master manifest, or the flat playlist of the old worker', async () => {
    await put('private/route-videos/r1/u1.mp4')
    await put('public/route-videos/r1/u1/master.m3u8')
    await put('private/route-videos/r1/u2.mp4')
    await put('public/route-videos/r1/u2/playlist.m3u8')
    expect(await findPending(dirStore(root), ['b'], quiet)).toEqual([])
  })

  it('finds photos without a master, whatever the extension case, and ignores formats it cannot read', async () => {
    await put('private/route-photos/r1/a.jpg')
    await put('private/route-photos/r1/b.HEIC')
    await put('private/route-photos/r1/c.gif')
    await put('private/route-photos/r1/d.png')
    await put('public/route-photos/r1/d.avif')
    await put('public/route-photos/r1/d.w480.avif') // the master is complete, so only the two sources are pending
    const keys = (await findPending(dirStore(root), ['b'], quiet)).map((job) => job.key).sort()
    expect(keys).toEqual(['private/route-photos/r1/a.jpg', 'private/route-photos/r1/b.HEIC'])
  })

  it('finds masters that have no smallest rendition, and ignores renditions and previews', async () => {
    await put('public/route-photos/r1/old.avif')
    await put('public/route-photos/r1/done.avif')
    await put('public/route-photos/r1/done.w480.avif')
    await put('public/route-photos/r1/done.share.jpg')
    expect(await findPending(dirStore(root), ['b'], quiet)).toEqual([
      { kind: 'renditions', bucket: 'b', key: 'public/route-photos/r1/old.avif' },
    ])
  })

  it('looks in every bucket it is given and keeps them apart', async () => {
    await put('private/route-photos/r1/a.jpg', 'one')
    await put('private/route-photos/r1/b.jpg', 'two')
    const found = await findPending(dirStore(root), ['one', 'two'], quiet)
    expect(found.map((job) => `${job.bucket}:${job.key}`).sort()).toEqual([
      'one:private/route-photos/r1/a.jpg',
      'two:private/route-photos/r1/b.jpg',
    ])
  })

  it('does not let a failed listing of one folder hide the others', async () => {
    await put('private/bike-model-videos/m1/u2.mp4')
    const inner = dirStore(root)
    const store: ObjectStore = {
      ...inner,
      list: async (bucket, prefix) => {
        if (prefix === 'private/route-videos/') throw new Error('R2 hiccup')
        return inner.list(bucket, prefix)
      },
    }
    expect((await findPending(store, ['b'], quiet)).map((job) => job.key)).toEqual(['private/bike-model-videos/m1/u2.mp4'])
  })
})

describe('scanOnce', () => {
  it('adds each pending object to the queue of its kind and says how many', async () => {
    await put('private/route-videos/r1/u1.mp4')
    await put('private/route-photos/r1/a.jpg')
    const added: Record<QueueKind, string[]> = { video: [], photo: [], renditions: [] }
    const queueOf = (kind: QueueKind) => ({ add: vi.fn(async (_name: string, _data: unknown, options: { jobId: string }) => { added[kind].push(options.jobId) }) }) as unknown as Pick<Queue, 'add'>

    const count = await scanOnce({ video: queueOf('video'), photo: queueOf('photo'), renditions: queueOf('renditions') }, dirStore(root), ['b'], quiet)

    expect(count).toBe(2)
    expect(added.video).toEqual(['b/private/route-videos/r1/u1.mp4'])
    expect(added.photo).toEqual(['b/private/route-photos/r1/a.jpg'])
    expect(added.renditions).toEqual([])
  })
})

describe('startScanner', () => {
  it('runs at once, then again after each interval, and stops when told to', async () => {
    const controller = new AbortController()
    let runs = 0
    const done = startScanner(async () => { if (++runs === 3) controller.abort() }, 5, controller.signal)
    await done
    expect(runs).toBe(3)
  })

  it('keeps going when a run fails', async () => {
    const controller = new AbortController()
    let runs = 0
    const done = startScanner(async () => {
      if (++runs === 2) controller.abort()
      throw new Error('boom')
    }, 5, controller.signal)
    await done
    expect(runs).toBe(2)
  })
})
