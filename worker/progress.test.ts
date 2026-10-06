// worker/progress.test.ts
import { describe, expect, it, vi } from 'vitest'
import { JobProgress } from '@/lib/queues/schemas'
import { progressReporter } from './progress'

describe('progressReporter', () => {
  it('writes the phase, the attempt and a timestamp the site can parse', async () => {
    const updateProgress = vi.fn(async (_value: object) => {})
    const report = progressReporter({ updateProgress }, 2)
    await report('transcoding', { percent: 35 })

    const written = updateProgress.mock.calls[0][0]
    expect(JobProgress.safeParse(written).success).toBe(true)
    expect(written).toMatchObject({ phase: 'transcoding', percent: 35, attempt: 2 })
  })

  it('carries the hash when a job is done', async () => {
    const updateProgress = vi.fn(async (_value: object) => {})
    await progressReporter({ updateProgress }, 1)('done', { percent: 100, sha256: 'b'.repeat(64) })
    expect(updateProgress.mock.calls[0][0]).toMatchObject({ phase: 'done', sha256: 'b'.repeat(64) })
  })
})
