// worker/jobs/video.integration.test.ts
// Needs ffmpeg and ffprobe. Skipped where they are not installed; CI installs them.
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pino from 'pino'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../config'
import { dirStore } from '../testing/dir-store'
import { hasFfmpeg, makeClip } from '../testing/ffmpeg'
import { createVideoHandler } from './video'
import type { MediaJob } from './types'

let root: string
let workdir: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'video-store-'))
  workdir = await mkdtemp(join(tmpdir(), 'video-work-'))
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

describe.skipIf(!hasFfmpeg())('the video handler, with the real ffmpeg', () => {
  for (const audio of [true, false]) {
    it(`makes the four rungs and a master manifest from a clip ${audio ? 'with' : 'without'} sound, then deletes the source`, async () => {
      const key = 'private/route-videos/r1/u1.MP4'
      await mkdir(join(root, 'b', 'private', 'route-videos', 'r1'), { recursive: true })
      await makeClip(join(root, 'b', ...key.split('/')), { audio })
      const store = dirStore(root)
      const progress: { phase: string; percent?: number }[] = []
      const job: MediaJob = {
        data: { bucket: 'b', key },
        attemptsMade: 0,
        opts: { attempts: 3 },
        updateProgress: vi.fn(async (value: object) => { progress.push(value as { phase: string }) }),
      }

      const result = await createVideoHandler({ store, config: config(), log: quiet })(job)

      const keys = store.uploads.map((u) => u.key)
      expect(keys[keys.length - 1]).toBe('public/route-videos/r1/u1/master.m3u8')
      for (const rung of ['1080p', '720p', '480p', '360p']) {
        expect(keys).toContain(`public/route-videos/r1/u1/${rung}/playlist.m3u8`)
        expect(keys.some((k) => k.startsWith(`public/route-videos/r1/u1/${rung}/seg`))).toBe(true)
      }
      const master = await readFile(join(root, 'b', 'public', 'route-videos', 'r1', 'u1', 'master.m3u8'), 'utf8')
      expect(master.match(/#EXT-X-STREAM-INF/g)).toHaveLength(4)
      expect(await store.exists('b', key)).toBe(false)
      expect(result.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(progress.map((p) => p.phase)[0]).toBe('downloading')
      expect(progress[progress.length - 1]).toMatchObject({ phase: 'done', percent: 100 })
    }, 180_000)
  }

  it('refuses a playlist disguised as a video instead of fetching what it points at', async () => {
    // ffmpeg picks a demuxer by content, not by extension: an HLS playlist named .mp4 would make it read the files the
    // playlist names, off the worker's own disk or from any address it can reach.
    const outside = join(root, 'outside', 'clip.mp4')
    await mkdir(join(root, 'outside'), { recursive: true })
    await makeClip(outside)
    const key = 'private/route-videos/r1/evil.mp4'
    await mkdir(join(root, 'b', 'private', 'route-videos', 'r1'), { recursive: true })
    await writeFile(
      join(root, 'b', ...key.split('/')),
      ['#EXTM3U', '#EXT-X-TARGETDURATION:2', '#EXTINF:2,', `file:///${outside.replaceAll('\\', '/')}`, '#EXT-X-ENDLIST', ''].join('\n'),
    )
    const store = dirStore(root)
    const job: MediaJob = { data: { bucket: 'b', key }, attemptsMade: 0, opts: {}, updateProgress: async () => {} }

    await expect(createVideoHandler({ store, config: config(), log: quiet })(job)).rejects.toThrow()
    expect(store.uploads).toEqual([])
    expect(await store.exists('b', key)).toBe(true)
  }, 120_000)

  it('treats a video whose source is already gone but whose stream is there as done', async () => {
    await mkdir(join(root, 'b', 'public', 'route-videos', 'r1', 'u1'), { recursive: true })
    await writeFile(join(root, 'b', 'public', 'route-videos', 'r1', 'u1', 'master.m3u8'), '#EXTM3U')
    const job: MediaJob = { data: { bucket: 'b', key: 'private/route-videos/r1/u1.mp4' }, attemptsMade: 0, opts: {}, updateProgress: async () => {} }

    expect(await createVideoHandler({ store: dirStore(root), config: config(), log: quiet })(job)).toEqual({ skipped: true })
  })
})
