// worker/jobs/video.test.ts
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pino from 'pino'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../config'
import { dirStore } from '../testing/dir-store'
import {
  INPUT_FORMATS, MASTER_MANIFEST, RENDITIONS, SEGMENT_SECONDS, buildFfmpegArgs, ffmpegCommand, parseOutTimeUs, uploadTree,
  createVideoHandler, withInputWhitelist,
} from './video'

describe('the ladder', () => {
  it('is the one that was measured, rung for rung', () => {
    expect(RENDITIONS.map((r) => [r.label, r.width, r.height, r.videoBitrate, r.maxBitrate, r.audioBitrate])).toEqual([
      ['1080p', 1920, 1080, '3500k', '3850k', '128k'],
      ['720p', 1280, 720, '1800k', '1980k', '128k'],
      ['480p', 854, 480, '1000k', '1100k', '96k'],
      ['360p', 640, 360, '550k', '605k', '64k'],
    ])
    expect(SEGMENT_SECONDS).toBe(4)
    expect(MASTER_MANIFEST).toBe('master.m3u8')
  })
})

describe('buildFfmpegArgs', () => {
  it('asks ffmpeg exactly what the Python worker asked', async () => {
    const golden = JSON.parse(await readFile(join(__dirname, '..', 'fixtures', 'ffmpeg-args.golden.json'), 'utf8')) as string[]
    expect(buildFfmpegArgs('/work/input.mp4', '/work/hls')).toEqual(golden)
  })

  it('asks for the audio as optional by default', () => {
    expect(buildFfmpegArgs('in.mp4', 'out')).toContain('0:a?')
  })

  it('leaves the audio out of the maps when the source has none: ffmpeg refuses a stream map that names a track that is not there', () => {
    const args = buildFfmpegArgs('in.mp4', 'out', { audio: false })
    expect(args).not.toContain('0:a?')
    expect(args.some((arg) => arg.startsWith('-c:a:'))).toBe(false)
    expect(args[args.indexOf('-var_stream_map') + 1]).toBe('v:0,name:1080p v:1,name:720p v:2,name:480p v:3,name:360p')
  })
})

describe('withInputWhitelist', () => {
  it('limits the demuxers to the containers the accepted extensions need, ahead of the input', () => {
    const args = withInputWhitelist(buildFfmpegArgs('in.mp4', 'out'))
    const at = args.indexOf('-format_whitelist')
    expect(args.slice(at, at + 3)).toEqual(['-format_whitelist', INPUT_FORMATS, '-i'])
    expect(args.indexOf('-i')).toBe(at + 2)
    // Nothing else moves: the rest is the golden call.
    expect(args.filter((_arg: string, i: number) => i !== at && i !== at + 1)).toEqual(buildFfmpegArgs('in.mp4', 'out'))
  })

  it('names no container that can point at other files or addresses', () => {
    for (const unwanted of ['hls', 'concat', 'sdp', 'rtsp', 'image2', 'data']) {
      expect(INPUT_FORMATS.split(',')).not.toContain(unwanted)
    }
  })
})

describe('parseOutTimeUs', () => {
  it('reads the progress line ffmpeg prints on stdout', () => {
    expect(parseOutTimeUs('out_time_us=4500000')).toBe(4_500_000)
  })
  it('ignores every other line', () => {
    expect(parseOutTimeUs('frame=120')).toBeNull()
    expect(parseOutTimeUs('out_time=00:00:04.50')).toBeNull()
    expect(parseOutTimeUs('')).toBeNull()
  })
})

describe('ffmpegCommand', () => {
  it('runs ffmpeg at a lower priority on Linux, so a transcode never slows the site', () => {
    expect(ffmpegCommand(['ffmpeg', '-i', 'a'], 'linux')).toEqual({ command: 'nice', args: ['-n', '10', 'ffmpeg', '-i', 'a'] })
  })
  it('runs it plainly elsewhere', () => {
    expect(ffmpegCommand(['ffmpeg', '-i', 'a'], 'win32')).toEqual({ command: 'ffmpeg', args: ['-i', 'a'] })
  })
})

describe('uploadTree', () => {
  let root: string
  let hls: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'tree-store-'))
    hls = await mkdtemp(join(tmpdir(), 'tree-hls-'))
    for (const file of [
      'master.m3u8', '1080p/playlist.m3u8', '1080p/seg000.ts', '1080p/seg001.ts', '360p/playlist.m3u8', '360p/seg000.ts',
    ]) {
      await mkdir(join(hls, file, '..'), { recursive: true })
      await writeFile(join(hls, file), file)
    }
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
    await rm(hls, { recursive: true, force: true })
  })

  it('uploads the segments, then the playlists of the rungs, then the master manifest last', async () => {
    const store = dirStore(root)
    const count = await uploadTree(store, 'b', 'public/route-videos/r/u/', hls)

    expect(count).toBe(6)
    const keys = store.uploads.map((u) => u.key)
    expect(keys[keys.length - 1]).toBe('public/route-videos/r/u/master.m3u8')
    const lastSegment = Math.max(...keys.map((k, i) => (k.endsWith('.ts') ? i : -1)))
    const firstPlaylist = Math.min(...keys.map((k, i) => (k.endsWith('playlist.m3u8') ? i : Infinity)))
    expect(lastSegment).toBeLessThan(firstPlaylist)
  })

  it('gives each file its content type', async () => {
    const store = dirStore(root)
    await uploadTree(store, 'b', 'p/', hls)
    const type = (suffix: string) => store.uploads.find((u) => u.key.endsWith(suffix))?.contentType
    expect(type('.ts')).toBe('video/mp2t')
    expect(type('master.m3u8')).toBe('application/vnd.apple.mpegurl')
    expect(type('360p/playlist.m3u8')).toBe('application/vnd.apple.mpegurl')
  })
})

describe('what the video handler agrees to work on', () => {
  const config = (workdirBase: string) =>
    loadConfig({
      APP_ENV: 'staging', REDIS_URL: 'redis://x', R2_ACCOUNT_ID: 'a', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's',
      R2_BUCKETS: 'b', WORKDIR_BASE: workdirBase,
    })
  const jobOf = (bucket: string, key: string) => ({
    data: { bucket, key }, attemptsMade: 0, opts: {}, updateProgress: async () => {},
  })

  it('refuses a bucket it was not configured for, before touching the disk or the store', async () => {
    const root = await mkdtemp(join(tmpdir(), 'v-root-'))
    const work = await mkdtemp(join(tmpdir(), 'v-work-'))
    try {
      const store = dirStore(root)
      const handler = createVideoHandler({ store, config: config(work), log: pino({ level: 'silent' }) })
      await expect(handler(jobOf('../../elsewhere', 'private/route-videos/r1/u1.mp4'))).rejects.toThrow(/bucket/)
      await expect(handler(jobOf('other-bucket', 'private/route-videos/r1/u1.mp4'))).rejects.toThrow(/bucket/)
      expect(store.removed).toEqual([])
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(work, { recursive: true, force: true })
    }
  })

  it('refuses a key that is not a video source', async () => {
    const root = await mkdtemp(join(tmpdir(), 'v-root-'))
    try {
      const handler = createVideoHandler({ store: dirStore(root), config: config(root), log: pino({ level: 'silent' }) })
      for (const key of ['private/route-videos/../../x.mp4', 'private/route-photos/r1/u.jpg', '..']) {
        await expect(handler(jobOf('b', key))).rejects.toThrow(/not a video source/)
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
