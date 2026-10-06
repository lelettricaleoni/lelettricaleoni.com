// worker/parity.test.ts
// A measurement, not a regression test: it compares what this worker makes with what the Python worker made from the same
// photos, and writes a report. Skipped unless PARITY_DIR is set.
//
//   PARITY_DIR=temp/parity PARITY_PILLOW=temp/parity-pillow PARITY_REPORT=docs/ai/ideas/node-worker-parity.md \
//     npx vitest run worker/parity.test.ts
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, parse } from 'node:path'
import { ssim } from 'ssim.js'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { decodeHeic, isHeicKey } from './heic'
import { renderPhoto } from './imaging'
import { testImagingConfig } from './testing/images'

const photos = process.env.PARITY_DIR
const pillow = process.env.PARITY_PILLOW
const report = process.env.PARITY_REPORT

const SIZE_RATIO = { min: 0.85, max: 1.15 }
const MIN_SSIM = 0.985

async function rgba(path: string) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data: new Uint8ClampedArray(data), width: info.width, height: info.height }
}

describe.skipIf(!photos || !pillow)('Node against Pillow, on the same photos', () => {
  it('stays within the thresholds fixed beforehand', async () => {
    const rows: string[] = []
    const failures: string[] = []
    const scratch = await mkdtemp(join(tmpdir(), 'parity-'))
    try {
      for (const file of (await readdir(photos!)).sort()) {
        const name = parse(file).name
        const reference = join(pillow!, name)
        const out = {
          master: join(scratch, `${name}-master.avif`),
          share: join(scratch, `${name}-share.jpg`),
          renditions: { 480: join(scratch, `${name}-480.avif`), 960: join(scratch, `${name}-960.avif`), 1600: join(scratch, `${name}-1600.avif`) },
        }
        const source = join(photos!, file)
        const input = isHeicKey(file) ? await decodeHeic(await readFile(source)) : source
        await renderPhoto(input, out, testImagingConfig)

        const [mine, theirs] = [await sharp(out.master).metadata(), await sharp(join(reference, 'master.avif')).metadata()]
        const sameSize = mine.width === theirs.width && mine.height === theirs.height
        const bytes = (await readFile(out.master)).length / (await readFile(join(reference, 'master.avif'))).length
        const score = ssim(await rgba(out.master), await rgba(join(reference, 'master.avif'))).mssim

        rows.push(`| ${file} | ${mine.width}×${mine.height} | ${theirs.width}×${theirs.height} | ${bytes.toFixed(2)} | ${score.toFixed(4)} |`)
        if (!sameSize) failures.push(`${file}: size differs`)
        if (bytes < SIZE_RATIO.min || bytes > SIZE_RATIO.max) failures.push(`${file}: weight ratio ${bytes.toFixed(2)}`)
        if (score < MIN_SSIM) failures.push(`${file}: SSIM ${score.toFixed(4)}`)
      }
    } finally {
      await rm(scratch, { recursive: true, force: true })
    }

    if (report) {
      await writeFile(
        report,
        `# Node against Pillow, photo by photo\n\nThresholds fixed beforehand: same size; master weight between ${SIZE_RATIO.min} and ${SIZE_RATIO.max} times Pillow's; SSIM ≥ ${MIN_SSIM}.\n\n| Photo | Node | Pillow | Weight ratio | SSIM |\n|---|---|---|---|---|\n${rows.join('\n')}\n\n${failures.length ? '**Out of threshold:**\n\n' + failures.map((f) => `- ${f}`).join('\n') : 'All within the thresholds.'}\n`,
      )
    }
    expect(failures).toEqual([])
  }, 600_000)
})
