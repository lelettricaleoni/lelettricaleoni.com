import { describe, it, expect } from 'vitest'
import { mediaProgress } from './media-progress'
import type { VideoJobStatus } from './video-jobs'

const job = (phase: VideoJobStatus['phase'], extra: Partial<VideoJobStatus> = {}): VideoJobStatus =>
  ({ phase, updatedAt: 0, ...extra })

describe('mediaProgress — photo', () => {
  it('uses the whole bar for the upload', () => {
    expect(mediaProgress('photo', { progress: 40 })?.percent).toBe(40)
  })

  it('disappears once uploaded: nothing left to wait for', () => {
    expect(mediaProgress('photo', undefined)).toBeNull()
  })
})

describe('mediaProgress — video', () => {
  it('the upload fills the first half', () => {
    expect(mediaProgress('video', { progress: 0 })?.percent).toBe(0)
    expect(mediaProgress('video', { progress: 50 })?.percent).toBe(25)
    expect(mediaProgress('video', { progress: 100 })?.percent).toBe(50)
  })

  it('covers the gap between upload and worker', () => {
    // The gap that used to make the work look stalled.
    const p = mediaProgress('video', undefined, undefined)
    expect(p).toMatchObject({ percent: 50, tone: 'working', active: true })
    expect(p!.label).toContain('Waiting')
  })

  it('processing fills the second half', () => {
    expect(mediaProgress('video', undefined, job('transcoding', { progress: 0 }))?.percent).toBe(50)
    expect(mediaProgress('video', undefined, job('transcoding', { progress: 50 }))?.percent).toBe(75)
    expect(mediaProgress('video', undefined, job('transcoding', { progress: 100 }))?.percent).toBe(100)
  })

  it('never goes backwards across the whole journey', () => {
    const sequence = [
      mediaProgress('video', { progress: 10 }),
      mediaProgress('video', { progress: 100 }),
      mediaProgress('video', undefined, undefined),
      mediaProgress('video', undefined, job('queued')),
      mediaProgress('video', undefined, job('downloading')),
      mediaProgress('video', undefined, job('transcoding', { progress: 30 })),
      mediaProgress('video', undefined, job('transcoding', { progress: 90 })),
      mediaProgress('video', undefined, job('uploading')),
      mediaProgress('video', undefined, job('done')),
    ].map((p) => p!.percent)

    for (let i = 1; i < sequence.length; i++) {
      expect(sequence[i]).toBeGreaterThanOrEqual(sequence[i - 1])
    }
    expect(sequence.at(-1)).toBe(100)
  })

  it('shows the real percentage, not the bar\'s', () => {
    expect(mediaProgress('video', { progress: 40 })!.label).toBe('Uploading 40%')
    expect(mediaProgress('video', undefined, job('transcoding', { progress: 40 }))!.label)
      .toBe('Processing 40%')
  })
})

describe('mediaProgress — outcomes', () => {
  it('a failed upload stops and shows it', () => {
    expect(mediaProgress('video', { progress: 30, failed: true })).toMatchObject({
      tone: 'error', active: false,
    })
  })

  it('a failed transcode carries its reason along', () => {
    const p = mediaProgress('video', undefined, job('failed', { error: 'ffmpeg blew up', attempt: 3 }))
    expect(p).toMatchObject({ tone: 'error', active: false, detail: 'ffmpeg blew up' })
  })

  it('stops being active once ready', () => {
    expect(mediaProgress('video', undefined, job('done'))).toMatchObject({
      percent: 100, tone: 'ready', active: false,
    })
  })

  it('flags attempts after the first', () => {
    expect(mediaProgress('video', undefined, job('transcoding', { progress: 10, attempt: 2 }))?.detail)
      .toBe('attempt 2')
    expect(mediaProgress('video', undefined, job('transcoding', { progress: 10, attempt: 1 }))?.detail)
      .toBeUndefined()
  })
})
