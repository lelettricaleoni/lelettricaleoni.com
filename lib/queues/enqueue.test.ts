// lib/queues/enqueue.test.ts
import { describe, expect, it, vi } from 'vitest'
import type { Queue } from 'bullmq'
import { enqueueMediaJob } from './enqueue'
import { JOB_OPTIONS } from './options'

const queueOf = (add: unknown) => ({ add }) as unknown as Pick<Queue, 'add'>

describe('enqueueMediaJob', () => {
  it('queues a staged photo under its object as the id', async () => {
    const add = vi.fn(async () => ({}))
    const outcome = await enqueueMediaJob('private/route-photos/r1/u1.jpg', { bucket: 'b', queue: queueOf(add) })
    expect(outcome).toBe('queued')
    expect(add).toHaveBeenCalledWith('process', { bucket: 'b', key: 'private/route-photos/r1/u1.jpg' }, { ...JOB_OPTIONS, jobId: 'b/private/route-photos/r1/u1.jpg' })
  })

  it('queues a video on the video queue', async () => {
    const add = vi.fn(async (..._args: unknown[]) => ({}))
    await enqueueMediaJob('private/bike-model-videos/m1/u1.MOV', { bucket: 'b', queue: queueOf(add) })
    expect(add.mock.calls[0][0]).toBe('transcode')
  })

  it('skips a key the worker does not process, without touching the queue', async () => {
    const add = vi.fn()
    expect(await enqueueMediaJob('route-gpx/r1/track.gpx', { bucket: 'b', queue: queueOf(add) })).toBe('skipped')
    expect(add).not.toHaveBeenCalled()
  })

  it('skips when there is no bucket to name the job after', async () => {
    delete process.env.R2_BUCKET_NAME
    expect(await enqueueMediaJob('private/route-photos/r1/u1.jpg', { queue: queueOf(vi.fn()) })).toBe('skipped')
  })

  it('says unavailable, and does not throw, when there is no Redis', async () => {
    expect(await enqueueMediaJob('private/route-photos/r1/u1.jpg', { bucket: 'b', queue: null })).toBe('unavailable')
  })

  it('says unavailable, and does not throw, when Redis refuses: an upload must not fail because the queue is down', async () => {
    const add = vi.fn(async () => { throw new Error('ECONNREFUSED') })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await enqueueMediaJob('private/route-photos/r1/u1.jpg', { bucket: 'b', queue: queueOf(add) })).toBe('unavailable')
    log.mockRestore()
  })

  it('cannot be made to forge a log line by a key with a line break in it', async () => {
    const add = vi.fn(async () => { throw new Error('ECONNREFUSED') })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const key = 'private/route-photos/r1/u1\r\n[queue] forged entry.jpg'
    await enqueueMediaJob(key, { bucket: 'b', queue: queueOf(add) })
    const logged = log.mock.calls[0].map(String).join(' ')
    expect(logged).not.toMatch(/[\r\n]/)
    log.mockRestore()
  })

  it('cannot be made to forge a log line by an error message that quotes the key', async () => {
    // The queue's own error can carry the job id, which is built from the key.
    const add = vi.fn(async () => { throw new Error('Job b/private/route-photos/r1/u1\r\n[queue] forged entry.jpg already exists') })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await enqueueMediaJob('private/route-photos/r1/u1.jpg', { bucket: 'b', queue: queueOf(add) })
    const logged = log.mock.calls[0].map(String).join(' ')
    expect(logged).not.toMatch(/[\r\n]/)
    expect(logged).toContain('already exists')
    log.mockRestore()
  })
})
