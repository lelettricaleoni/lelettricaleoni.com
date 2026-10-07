// worker/integration.test.ts
// The whole path with a real Redis: enqueue → worker → result → status read back from the queue.
// Skipped without REDIS_URL; CI provides one (see .github/workflows/ci.yml, job `worker`).
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Queue, QueueEvents } from 'bullmq'
import { Redis } from 'ioredis'
import pino from 'pino'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addMediaJob } from '@/lib/queues/add-job'
import { enqueueMediaJob } from '@/lib/queues/enqueue'
import { QUEUE_NAMES } from '@/lib/queues/names'
import { jobIdFor } from '@/lib/queues/options'
import { readStatusFromQueue } from '@/lib/queues/status'
import { loadConfig } from './config'
import { createPhotoHandler } from './jobs/photo'
import { createRenditionsHandler } from './jobs/renditions'
import { createVideoHandler } from './jobs/video'
import { createQueues, startWorkers } from './runtime'
import { dirStore } from './testing/dir-store'
import { makeImage } from './testing/images'

const url = process.env.REDIS_URL
const quiet = pino({ level: 'silent' })

describe.skipIf(!url)('enqueue → worker → status, with a real Redis', () => {
  // TEST_QUEUE_PREFIX lets the same test run as a restricted Redis user (see deploy/redis), whose keys all start with `bullmq-<env>`.
  const prefix = process.env.TEST_QUEUE_PREFIX ?? `bullmq-test-${randomUUID().slice(0, 8)}`
  let root: string
  let workdir: string
  let connection: Redis
  let eventsConnection: Redis
  let queues: ReturnType<typeof createQueues>
  let workers: ReturnType<typeof startWorkers>
  let events: QueueEvents
  const store = () => dirStore(root)
  let theStore: ReturnType<typeof dirStore>

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'int-store-'))
    workdir = await mkdtemp(join(tmpdir(), 'int-work-'))
    theStore = store()
    const config = loadConfig({
      APP_ENV: 'staging', REDIS_URL: url!, R2_ACCOUNT_ID: 'a', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's',
      R2_BUCKETS: 'b', WORKDIR_BASE: workdir,
    })
    const deps = { store: theStore, config, log: quiet }
    connection = new Redis(url!, { maxRetriesPerRequest: null })
    eventsConnection = new Redis(url!, { maxRetriesPerRequest: null })
    queues = createQueues(connection, prefix)
    workers = startWorkers(
      connection, prefix,
      { video: createVideoHandler(deps), photo: createPhotoHandler(deps), renditions: createRenditionsHandler(deps) },
      quiet,
    )
    events = new QueueEvents(QUEUE_NAMES.photo, { connection: eventsConnection, prefix })
    await events.waitUntilReady()
  })

  afterAll(async () => {
    await Promise.all(Object.values(workers).map((worker) => worker.close()))
    await events.close()
    for (const queue of Object.values(queues)) {
      await queue.obliterate({ force: true })
      await queue.close()
    }
    connection.disconnect()
    eventsConnection.disconnect()
    await rm(root, { recursive: true, force: true })
    await rm(workdir, { recursive: true, force: true })
  })

  async function stage(key: string, content: Buffer) {
    const file = join(root, 'b', ...key.split('/'))
    await mkdir(join(file, '..'), { recursive: true })
    await writeFile(file, content)
  }

  it('processes a staged photo end to end, and the site reads the outcome from the queue', async () => {
    const key = 'private/route-photos/r1/u1.PNG'
    await stage(key, await makeImage({ width: 1800, height: 1200 }))

    expect(await enqueueMediaJob(key, { bucket: 'b', queue: queues.photo })).toBe('queued')
    const job = await queues.photo.getJob(jobIdFor('b', key))
    await job!.waitUntilFinished(events, 60_000)

    expect(await theStore.exists('b', 'public/route-photos/r1/u1.avif')).toBe(true)
    expect(await theStore.exists('b', 'public/route-photos/r1/u1.w480.avif')).toBe(true)
    expect(await theStore.exists('b', key)).toBe(false)

    const status = await readStatusFromQueue(queues.photo, jobIdFor('b', key))
    expect(status).toMatchObject({ phase: 'done', progress: 100 })
    expect(status?.sha256).toMatch(/^[0-9a-f]{64}$/)
  }, 90_000)

  it('reports a job that cannot succeed as failed, with the reason', async () => {
    const key = 'private/route-photos/r1/missing.png'
    // One attempt only, so that the test does not wait out the real backoff.
    await queues.photo.add('process', { bucket: 'b', key }, { jobId: jobIdFor('b', key), attempts: 1 })
    const job = await queues.photo.getJob(jobIdFor('b', key))
    await job!.waitUntilFinished(events, 30_000).catch(() => undefined)

    const status = await readStatusFromQueue(queues.photo, jobIdFor('b', key))
    expect(status).toMatchObject({ phase: 'failed' })
    expect(status?.error).toMatch(/not found/i)
  }, 60_000)

  it('makes one job when the same object is added twice (the upload confirmation and the scan arriving together)', async () => {
    const queue = new Queue(`dup-${randomUUID().slice(0, 6)}`, { connection, prefix })
    try {
      await addMediaJob(queue, 'photo', 'b', 'private/route-photos/r1/dup.jpg')
      await addMediaJob(queue, 'photo', 'b', 'private/route-photos/r1/dup.jpg')
      expect((await queue.getJobCounts('waiting', 'delayed', 'active')).waiting).toBe(1)
    } finally {
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })
})
