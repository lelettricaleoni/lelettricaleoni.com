// worker/jobs/video.ts
import { spawn } from 'node:child_process'
import { mkdir, readdir, rm } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { createInterface } from 'node:readline'
import pLimit from 'p-limit'
import { HLS_MANIFESTS, deriveHlsPrefix } from '@/lib/media/keys'
import { MediaJobData } from '@/lib/queues/schemas'
import { sha256OfFile } from '../hash'
import { progressReporter } from '../progress'
import { MissingObjectError, type ObjectStore } from '../storage'
import type { JobDeps, MediaJob } from './types'

/**
 * Video transcoding: any common video in, adaptive-bitrate HLS out.
 *
 * **The ladder is priced in bitrate, not in quality.** Constant quality (`-crf` under a `-maxrate` ceiling) was measured
 * against these settings on a real 94.5 s trail video and rejected: matched on VMAF it came out about 5% smaller, spread
 * evenly over every rung, so it buys a little storage and nothing for the viewer this ladder exists for, and it makes each
 * rung's advertised bandwidth a property of the footage, which is the number a player trusts to decide whether the rung
 * below will fit. These numbers are the ones measured; do not change them without measuring again.
 */

export const MASTER_MANIFEST = HLS_MANIFESTS[0]
export const LEGACY_MANIFEST = HLS_MANIFESTS[1]

/**
 * Segment length. Also the forced keyframe interval: `-hls_time` can only cut at a keyframe, so without one the muxer
 * waits for x264's own idea of a GOP and this becomes a lower bound, not a length.
 */
export const SEGMENT_SECONDS = 4

/**
 * The 360p rung is the floor for a phone on a trail above Dro. Without it the ladder stopped at 480p, which needs a
 * megabit held steadily: below that hls.js has nowhere left to step down to and the video stops instead of degrading.
 */
export const RENDITIONS = [
  { label: '1080p', width: 1920, height: 1080, videoBitrate: '3500k', maxBitrate: '3850k', audioBitrate: '128k' },
  { label: '720p', width: 1280, height: 720, videoBitrate: '1800k', maxBitrate: '1980k', audioBitrate: '128k' },
  { label: '480p', width: 854, height: 480, videoBitrate: '1000k', maxBitrate: '1100k', audioBitrate: '96k' },
  { label: '360p', width: 640, height: 360, videoBitrate: '550k', maxBitrate: '605k', audioBitrate: '64k' },
] as const

/** The arguments of the one ffmpeg call. The first element is the program, as in the golden file. */
export function buildFfmpegArgs(src: string, hlsDir: string, { audio = true }: { audio?: boolean } = {}): string[] {
  const count = RENDITIONS.length
  const filters = ['[0:v]split=' + count + RENDITIONS.map((_, i) => `[v${i}]`).join('')]
  RENDITIONS.forEach((rung, i) => {
    filters.push(
      `[v${i}]scale=w=${rung.width}:h=${rung.height}:force_original_aspect_ratio=decrease,` +
        `scale=trunc(iw/2)*2:trunc(ih/2)*2[s${i}]`,
    )
  })

  const args = ['ffmpeg', '-nostdin', '-i', src, '-filter_complex', filters.join(';')]
  const variantMap: string[] = []
  RENDITIONS.forEach((rung, i) => {
    args.push(
      '-map', `[s${i}]`,
      `-c:v:${i}`, 'libx264',
      `-b:v:${i}`, rung.videoBitrate,
      // A keyframe on every segment boundary, on the clock rather than on a frame count, so the rungs line up whatever
      // the source frame rate: otherwise they disagree about where a segment ends, which is what a player trips over
      // when it tries to switch down.
      `-force_key_frames:v:${i}`, `expr:gte(t,n_forced*${SEGMENT_SECONDS})`,
      // Scene detection would add keyframes the muxer cannot use while costing bits and time.
      `-x264-params:v:${i}`, 'scenecut=0',
      `-maxrate:v:${i}`, rung.maxBitrate,
      `-bufsize:v:${i}`, `${parseInt(rung.maxBitrate, 10) * 2}k`,
      `-preset:v:${i}`, 'medium',
    )
    // A source with no sound track must not name one: ffmpeg refuses the stream map ("a:0" is not there). With audio
    // the arguments are exactly the Python worker's.
    if (audio) args.push('-map', '0:a?', `-c:a:${i}`, 'aac', `-b:a:${i}`, rung.audioBitrate)
    variantMap.push(audio ? `v:${i},a:${i},name:${rung.label}` : `v:${i},name:${rung.label}`)
  })

  args.push(
    '-var_stream_map', variantMap.join(' '),
    '-f', 'hls',
    '-hls_time', String(SEGMENT_SECONDS),
    '-hls_playlist_type', 'vod',
    '-hls_segment_filename', `${hlsDir}/%v/seg%03d.ts`,
    '-master_pl_name', MASTER_MANIFEST,
    // Machine-readable progress on stdout; without -nostats ffmpeg also writes its human-readable bar to stderr.
    '-progress', 'pipe:1', '-nostats',
    '-y', `${hlsDir}/%v/playlist.m3u8`,
  )
  return args
}

const OUT_TIME = /^out_time_us=(\d+)$/

/** Microseconds of video done, from one line of ffmpeg's progress output, or null for any other line. */
export function parseOutTimeUs(line: string): number | null {
  const match = OUT_TIME.exec(line.trim())
  return match ? Number(match[1]) : null
}

/** On Linux ffmpeg runs under `nice`, so a transcode takes whatever CPU the site leaves and never slows a page. */
export function ffmpegCommand(args: string[], platform: NodeJS.Platform = process.platform): { command: string; args: string[] } {
  return platform === 'linux'
    ? { command: 'nice', args: ['-n', '10', ...args] }
    : { command: args[0], args: args.slice(1) }
}

export async function probeDuration(path: string): Promise<number> {
  const child = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path], {
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  let out = ''
  child.stdout.on('data', (chunk: Buffer) => { out += chunk.toString() })
  await new Promise<void>((resolve) => { child.once('close', () => resolve()); child.once('error', () => resolve()) })
  const seconds = parseFloat(out.trim())
  return Number.isFinite(seconds) ? seconds : 0
}

/** Whether the source has a sound track. */
export async function probeHasAudio(path: string): Promise<boolean> {
  const child = spawn('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', path], {
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  let out = ''
  child.stdout.on('data', (chunk: Buffer) => { out += chunk.toString() })
  await new Promise<void>((resolve) => { child.once('close', () => resolve()); child.once('error', () => resolve()) })
  return out.trim().length > 0
}

/** Runs ffmpeg and reports a percentage every five points: enough to animate a bar, few enough to be cheap. */
export async function runFfmpeg(
  args: string[],
  durationS: number,
  onPercent: (percent: number) => Promise<void>,
): Promise<void> {
  const { command, args: rest } = ffmpegCommand(args)
  const child = spawn(command, rest, { stdio: ['ignore', 'pipe', 'pipe'] })

  let stderrTail = ''
  child.stderr.on('data', (chunk: Buffer) => { stderrTail = (stderrTail + chunk.toString()).slice(-800) })
  const exited = new Promise<number>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code) => resolve(code ?? -1))
  })

  let lastReported = -5
  for await (const line of createInterface({ input: child.stdout })) {
    const micros = parseOutTimeUs(line)
    if (micros === null || durationS <= 0) continue
    const percent = Math.min(99, Math.floor((micros / 1_000_000 / durationS) * 100))
    if (percent >= lastReported + 5) {
      lastReported = percent
      await onPercent(percent)
    }
  }

  const code = await exited
  if (code !== 0) throw new Error(`ffmpeg exited with ${code}: ${stderrTail}`)
}

async function listFiles(dir: string, prefix = ''): Promise<string[]> {
  const found: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) found.push(...(await listFiles(join(dir, entry.name), `${prefix}${entry.name}/`)))
    else found.push(prefix + entry.name)
  }
  return found
}

function contentTypeOf(name: string): string {
  if (name.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl'
  return name.endsWith('.ts') ? 'video/mp2t' : 'application/octet-stream'
}

/**
 * Upload the ladder, in an order that never lets the site call a video ready too early: segments first (in parallel),
 * then each rung's playlist, then the master manifest, whose presence is what the site and the scan read as "done".
 */
export async function uploadTree(
  store: ObjectStore,
  bucket: string,
  prefix: string,
  hlsDir: string,
  concurrency = 6,
): Promise<number> {
  const files = await listFiles(hlsDir)
  const segments = files.filter((file) => !file.endsWith('.m3u8'))
  const playlists = files.filter((file) => file.endsWith('.m3u8') && file !== MASTER_MANIFEST)
  const masters = files.filter((file) => file === MASTER_MANIFEST)

  const limit = pLimit(concurrency)
  const put = (relative: string) =>
    store.upload(bucket, prefix + relative, join(hlsDir, ...relative.split('/')), { contentType: contentTypeOf(relative) })

  await Promise.all(segments.map((file) => limit(() => put(file))))
  await Promise.all(playlists.map((file) => limit(() => put(file))))
  for (const file of masters) await put(file)
  return files.length
}

export function createVideoHandler({ store, config, log }: JobDeps) {
  return async function transcodeVideo(
    job: MediaJob,
  ): Promise<{ files?: number; sha256?: string; skipped?: boolean }> {
    const { bucket, key } = MediaJobData.parse(job.data)
    const attempt = job.attemptsMade + 1
    const report = progressReporter(job, attempt)
    const prefix = deriveHlsPrefix(key)

    const workdir = join(config.workdirBase, bucket, key.replaceAll('/', '_'))
    const hlsDir = join(workdir, 'hls')
    const source = join(workdir, 'input' + extname(key))

    await rm(workdir, { recursive: true, force: true })
    await mkdir(hlsDir, { recursive: true })

    try {
      await report('downloading')
      log.info({ bucket, key, attempt }, 'video: downloading')
      try {
        await store.download(bucket, key, source)
      } catch (err) {
        if (err instanceof MissingObjectError) {
          const done = await Promise.all(HLS_MANIFESTS.map((name) => store.exists(bucket, prefix + name)))
          if (done.some(Boolean)) {
            log.info({ bucket, key }, 'video: source already transcoded')
            return { skipped: true }
          }
        }
        throw err
      }

      // The only place the source exists outside R2 is here: the site never receives a video, and this copy is deleted
      // below once the transcode has succeeded.
      const sha256 = await sha256OfFile(source)

      const duration = await probeDuration(source)
      const audio = await probeHasAudio(source)
      await report('transcoding', { percent: 0 })
      log.info({ bucket, key, durationS: duration, audio, rungs: RENDITIONS.length }, 'video: transcoding')
      await runFfmpeg(buildFfmpegArgs(source, hlsDir, { audio }), duration, (percent) => report('transcoding', { percent }))

      await report('uploading', { percent: 99 })
      const files = await uploadTree(store, bucket, prefix, hlsDir)
      log.info({ bucket, prefix, files }, 'video: uploaded')

      await store.remove(bucket, key)
      await report('done', { percent: 100, sha256 })
      log.info({ bucket, manifest: prefix + MASTER_MANIFEST }, 'video: done')
      return { files, sha256 }
    } finally {
      await rm(workdir, { recursive: true, force: true })
    }
  }
}
