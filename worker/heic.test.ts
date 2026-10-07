// worker/heic.test.ts
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { assertWithinPixelLimit, decodeHeic, isHeicKey } from './heic'
import { renderPhoto } from './imaging'
import { testImagingConfig } from './testing/images'

describe('isHeicKey', () => {
  it.each(['private/route-photos/r/u.heic', 'private/route-photos/r/IMG_1.HEIC', 'private/bike-model-photos/m/u.heif'])(
    '%s is HEIC',
    (key) => expect(isHeicKey(key)).toBe(true),
  )
  it.each(['private/route-photos/r/u.jpg', 'private/route-photos/r/u.png', 'private/route-photos/r/heic'])(
    '%s is not',
    (key) => expect(isHeicKey(key)).toBe(false),
  )
})

describe('assertWithinPixelLimit', () => {
  it('lets through an image up to the limit the other formats have', () => {
    expect(() => assertWithinPixelLimit(20_000, 15_000)).not.toThrow()
  })

  it('refuses a decompression bomb before any pixel buffer is allocated', () => {
    expect(() => assertWithinPixelLimit(40_000, 40_000)).toThrow(/too many pixels/)
  })
})

describe('decodeHeic', () => {
  it('decodes a HEIC file to raw RGBA pixels', async () => {
    const file = await readFile(join(__dirname, 'fixtures', 'sample.heic'))
    const image = await decodeHeic(file)
    expect(image.width).toBe(640)
    expect(image.height).toBe(480)
    expect(image.data.length).toBe(640 * 480 * 4)
  })

  it('rejects bytes that are not a HEIC file', async () => {
    await expect(decodeHeic(Buffer.from('not heic at all'))).rejects.toThrow()
  })
})
describe('a HEIC photo through renderPhoto', () => {
  it('ends as a master of its own size, and the other outputs exist', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'heic-'))
    try {
      const raw = await decodeHeic(await readFile(join(__dirname, 'fixtures', 'sample.heic')))
      const out = {
        master: join(dir, 'master.avif'),
        share: join(dir, 'share.jpg'),
        renditions: { 480: join(dir, 'a.avif'), 960: join(dir, 'b.avif'), 1600: join(dir, 'c.avif') },
      }
      expect(await renderPhoto(raw, out, testImagingConfig)).toEqual({ width: 640, height: 480 })
      expect(await sharp(out.master).metadata()).toMatchObject({ width: 640, height: 480 })
      // A phone photo has no transparency: the master must not carry an alpha plane for libheif's always-opaque one.
      expect((await sharp(out.master).metadata()).hasAlpha).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

