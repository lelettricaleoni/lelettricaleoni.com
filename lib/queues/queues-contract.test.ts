// lib/queues/queues-contract.test.ts
import { describe, expect, it, vi } from 'vitest'
import type { Queue } from 'bullmq'
import { JOB_NAMES, QUEUE_KINDS, QUEUE_NAMES, queuePrefix } from './names'
import { JOB_PHASES, JobProgress, MediaJobData } from './schemas'
import { JOB_OPTIONS, MAX_ATTEMPTS, jobIdFor, queueKindForKey } from './options'
import { addMediaJob } from './add-job'

describe('queue names', () => {
  it('are the three the worker has always had', () => {
    expect(QUEUE_NAMES).toEqual({ video: 'video-transcode', photo: 'image-process', renditions: 'image-renditions' })
    expect(QUEUE_KINDS).toEqual(['video', 'photo', 'renditions'])
    expect(JOB_NAMES).toEqual({ video: 'transcode', photo: 'process', renditions: 'render' })
  })

  it('keeps the environments apart with a prefix', () => {
    expect(queuePrefix('production')).toBe('bullmq-production')
    expect(queuePrefix('staging')).toBe('bullmq-staging')
  })
})

describe('MediaJobData', () => {
  it('accepts a bucket and a key', () => {
    expect(MediaJobData.parse({ bucket: 'b', key: 'private/route-photos/r/u.jpg' })).toEqual({
      bucket: 'b', key: 'private/route-photos/r/u.jpg',
    })
  })

  it.each([{}, { bucket: '', key: 'k' }, { bucket: 'b' }, { bucket: 'b', key: 42 }])('rejects %j', (value) => {
    expect(MediaJobData.safeParse(value).success).toBe(false)
  })
})

describe('JobProgress', () => {
  it('has the phases the panel already knows', () => {
    expect([...JOB_PHASES]).toEqual(['queued', 'downloading', 'transcoding', 'uploading', 'done', 'failed'])
  })

  it('accepts what the worker reports and rejects a phase nobody knows', () => {
    expect(JobProgress.safeParse({ phase: 'transcoding', percent: 40, attempt: 1, updatedAt: 5 }).success).toBe(true)
    expect(JobProgress.safeParse({ phase: 'melting', updatedAt: 5 }).success).toBe(false)
    expect(JobProgress.safeParse({ phase: 'done', percent: 140, updatedAt: 5 }).success).toBe(false)
    expect(JobProgress.safeParse({ phase: 'done', sha256: 'nope', updatedAt: 5 }).success).toBe(false)
  })
})

describe('job options', () => {
  it('retry three times with a growing wait, keep finished jobs an hour and failed ones five hundred', () => {
    expect(MAX_ATTEMPTS).toBe(3)
    expect(JOB_OPTIONS).toEqual({
      attempts: 3,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: { age: 3600 },
      removeOnFail: { count: 500 },
    })
  })

  it('identifies a job by the object it is about, so the queue refuses duplicates by itself', () => {
    expect(jobIdFor('lelettrica-trails', 'private/route-videos/r/u.mp4')).toBe('lelettrica-trails/private/route-videos/r/u.mp4')
  })
})

describe('queueKindForKey', () => {
  it.each([
    ['private/route-videos/r/u.mp4', 'video'],
    ['private/bike-model-videos/m/u.MOV', 'video'],
    ['private/route-photos/r/u.jpg', 'photo'],
    ['private/bike-model-photos/m/u.HEIC', 'photo'],
  ])('%s goes to the %s queue', (key, kind) => {
    expect(queueKindForKey(key)).toBe(kind)
  })

  it.each(['public/route-photos/r/u.avif', 'route-gpx/r/track.gpx', 'private/route-videos/r/u.txt'])('%s is not a job', (key) => {
    expect(queueKindForKey(key)).toBeNull()
  })
})

describe('addMediaJob', () => {
  it('adds the job under its object as the id, with the shared options', async () => {
    const add = vi.fn(async () => ({}))
    await addMediaJob({ add } as unknown as Pick<Queue, 'add'>, 'photo', 'b', 'private/route-photos/r/u.jpg')
    expect(add).toHaveBeenCalledWith(
      'process',
      { bucket: 'b', key: 'private/route-photos/r/u.jpg' },
      { ...JOB_OPTIONS, jobId: 'b/private/route-photos/r/u.jpg' },
    )
  })
})
