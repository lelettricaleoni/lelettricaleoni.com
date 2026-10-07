// worker/testing/ffmpeg.ts
import { execFile, spawnSync } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

export function hasFfmpeg(): boolean {
  return spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0
}

/** A short test-pattern clip, with or without a sound track (a silent clip is a case worth testing). */
export async function makeClip(path: string, { audio = true, seconds = 2 }: { audio?: boolean; seconds?: number } = {}): Promise<void> {
  const args = ['-y', '-f', 'lavfi', '-i', `testsrc=duration=${seconds}:size=640x360:rate=25`]
  if (audio) args.push('-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`)
  args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p')
  if (audio) args.push('-c:a', 'aac', '-shortest')
  args.push(path)
  await run('ffmpeg', args)
}
