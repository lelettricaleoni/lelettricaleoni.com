// lib/queues/status.test.ts
import { describe, expect, it } from 'vitest'
import type { Queue } from 'bullmq'
import { readStatusFromQueue, statusFromSnapshot } from './status'

const NOW = 1_700_000_000_000
const SHA = 'a'.repeat(64)

describe('statusFromSnapshot', () => {
  it('reports a job that has not started as queued', () => {
    for (const state of ['waiting', 'prioritized', 'paused', 'waiting-children']) {
      expect(statusFromSnapshot({ state, progress: 0, attemptsMade: 0 }, NOW)).toEqual({ phase: 'queued', attempt: undefined, updatedAt: NOW })
    }
  })

  it('reports a job waiting to be retried as queued, naming the attempt that is coming', () => {
    expect(statusFromSnapshot({ state: 'delayed', progress: 0, attemptsMade: 1 }, NOW)).toMatchObject({ phase: 'queued', attempt: 2 })
  })

  it('reports a running job by the phase and percentage it last wrote', () => {
    const progress = { phase: 'transcoding', percent: 40, attempt: 1, updatedAt: 123 }
    expect(statusFromSnapshot({ state: 'active', progress, attemptsMade: 0 }, NOW)).toEqual({
      phase: 'transcoding', progress: 40, attempt: 1, updatedAt: 123,
    })
  })

  it('reports a running job that has not written anything yet as downloading', () => {
    expect(statusFromSnapshot({ state: 'active', progress: 0, attemptsMade: 1 }, NOW)).toEqual({
      phase: 'downloading', progress: undefined, attempt: 2, updatedAt: NOW,
    })
  })

  it('never reports done or failed for a job that is still active', () => {
    const progress = { phase: 'done', updatedAt: 1 }
    expect(statusFromSnapshot({ state: 'active', progress, attemptsMade: 0 }, NOW).phase).toBe('downloading')
  })

  it('reports a finished job as done, with the hash the job returned', () => {
    expect(statusFromSnapshot({ state: 'completed', progress: { phase: 'done', updatedAt: 9 }, attemptsMade: 0, returnvalue: { sha256: SHA } }, NOW))
      .toEqual({ phase: 'done', progress: 100, updatedAt: 9, sha256: SHA })
  })

  it('ignores a returned hash that is not a SHA-256', () => {
    expect(statusFromSnapshot({ state: 'completed', progress: 0, attemptsMade: 0, returnvalue: { sha256: 'nope' } }, NOW).sha256).toBeUndefined()
  })

  it('reports a job that gave up as failed, with its reason cut to 500 characters', () => {
    const long = 'x'.repeat(900)
    const status = statusFromSnapshot({ state: 'failed', progress: 0, attemptsMade: 3, failedReason: long }, NOW)
    expect(status).toMatchObject({ phase: 'failed', attempt: 3 })
    expect(status.error).toHaveLength(500)
  })

  it('says something when a failure has no reason', () => {
    expect(statusFromSnapshot({ state: 'failed', progress: 0, attemptsMade: 3 }, NOW).error).toBe('Processing failed')
  })

  it('treats an unknown state as queued rather than failing the panel', () => {
    expect(statusFromSnapshot({ state: 'unknown', progress: null, attemptsMade: 0 }, NOW).phase).toBe('queued')
  })
})

describe('readStatusFromQueue', () => {
  it('returns null for a job the queue does not know, the way the panel already expects', async () => {
    const queue = { getJob: async () => undefined } as unknown as Pick<Queue, 'getJob'>
    expect(await readStatusFromQueue(queue, 'b/k')).toBeNull()
  })

  it('reads the state, progress and outcome of the job', async () => {
    const job = {
      getState: async () => 'active',
      progress: { phase: 'uploading', percent: 99, attempt: 1, updatedAt: 7 },
      attemptsMade: 0,
      failedReason: undefined,
      returnvalue: undefined,
    }
    const queue = { getJob: async (id: string) => (id === 'b/k' ? job : undefined) } as unknown as Pick<Queue, 'getJob'>
    expect(await readStatusFromQueue(queue, 'b/k')).toMatchObject({ phase: 'uploading', progress: 99 })
  })
})
