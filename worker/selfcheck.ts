// worker/selfcheck.ts
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { loadLibheif } from './heic'

const run = promisify(execFile)

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

/**
 * What the image must be able to do, checked when it starts and by the deploy before it switches containers: write
 * AVIF, run ffmpeg and ffprobe, load libheif. Returns the problems found, empty when all is well. Failing here stops the
 * deploy; not failing here would mean failing on the first upload.
 */
export async function selfCheck(): Promise<string[]> {
  const problems: string[] = []

  try {
    await sharp({ create: { width: 8, height: 8, channels: 3, background: '#808080' } }).avif().toBuffer()
  } catch (err) {
    problems.push(`sharp cannot write AVIF: ${message(err)}`)
  }

  for (const program of ['ffmpeg', 'ffprobe']) {
    try {
      await run(program, ['-version'])
    } catch {
      problems.push(`${program} is not installed or does not run`)
    }
  }

  try {
    new (loadLibheif().HeifDecoder)()
  } catch (err) {
    problems.push(`libheif-js does not load: ${message(err)}`)
  }

  return problems
}
