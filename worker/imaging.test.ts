// worker/imaging.test.ts
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cutRenditions, renderPhoto, type PhotoOutputs } from './imaging'
import { makeImage, testImagingConfig } from './testing/images'

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'imaging-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

const outputs = (): PhotoOutputs => ({
  master: join(dir, 'master.avif'),
  share: join(dir, 'share.jpg'),
  renditions: { 480: join(dir, 'w480.avif'), 960: join(dir, 'w960.avif'), 1600: join(dir, 'w1600.avif') },
})

async function source(buffer: Buffer, name = 'in.png'): Promise<string> {
  const path = join(dir, name)
  await writeFile(path, buffer)
  return path
}

const meta = (path: string) => sharp(path).metadata()

describe('renderPhoto', () => {
  it('fits a large photo in 2400 px, never up, and cuts the link preview and the renditions from it', async () => {
    const out = outputs()
    const size = await renderPhoto(await source(await makeImage({ width: 5000, height: 3000 })), out, testImagingConfig)

    expect(size).toEqual({ width: 2400, height: 1440 })
    expect(await meta(out.master)).toMatchObject({ format: 'heif', width: 2400, height: 1440 })
    expect(await meta(out.share)).toMatchObject({ format: 'jpeg', width: 1200, height: 720 })
    expect(await meta(out.renditions[480])).toMatchObject({ width: 480, height: 288 })
    expect(await meta(out.renditions[960])).toMatchObject({ width: 960, height: 576 })
    expect(await meta(out.renditions[1600])).toMatchObject({ width: 1600, height: 960 })
  })

  it('keeps a small photo at its own size and gives every rendition the same size, never enlarged', async () => {
    const out = outputs()
    const size = await renderPhoto(await source(await makeImage({ width: 100, height: 100 })), out, testImagingConfig)

    expect(size).toEqual({ width: 100, height: 100 })
    for (const width of [480, 960, 1600]) expect(await meta(out.renditions[width])).toMatchObject({ width: 100, height: 100 })
    expect(await meta(out.share)).toMatchObject({ width: 100, height: 100 })
  })

  it('turns a portrait photo the right way up from its EXIF orientation (a phone held upright)', async () => {
    const landscape = await sharp({ create: { width: 400, height: 200, channels: 3, background: '#336699' } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer()
    const out = outputs()

    const size = await renderPhoto(await source(landscape, 'in.jpg'), out, testImagingConfig)

    expect(size).toEqual({ width: 200, height: 400 })
    expect(await meta(out.master)).toMatchObject({ width: 200, height: 400 })
  })

  it('keeps the transparency of the master and puts the link preview on white, never on black', async () => {
    const transparent = await makeImage({ width: 200, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    const out = outputs()
    await renderPhoto(await source(transparent), out, testImagingConfig)

    expect((await meta(out.master)).hasAlpha).toBe(true)
    expect((await meta(out.renditions[480])).hasAlpha).toBe(true)
    expect((await meta(out.share)).hasAlpha).toBe(false)
    const { data } = await sharp(out.share).raw().toBuffer({ resolveWithObject: true })
    expect(Math.min(data[0], data[1], data[2])).toBeGreaterThan(240)
  })

  it('does not clip a 16-bit grey scan to white', async () => {
    const grey16 = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 128, g: 128, b: 128 } } })
      .toColourspace('grey16')
      .png()
      .toBuffer()
    // Fail loudly if the fixture is not what it claims to be, instead of passing for the wrong reason.
    expect((await sharp(grey16).metadata()).space).toBe('grey16')

    const out = outputs()
    await renderPhoto(await source(grey16), out, testImagingConfig)

    const { channels } = await sharp(out.master).stats()
    expect(channels[0].mean).toBeGreaterThan(110)
    expect(channels[0].mean).toBeLessThan(150)
  })

  it('converts a CMYK photo to sRGB instead of tagging RGB data with a CMYK profile', async () => {
    const cmyk = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#cc3322' } })
      .toColourspace('cmyk')
      .jpeg()
      .toBuffer()
    expect((await sharp(cmyk).metadata()).space).toBe('cmyk')

    const out = outputs()
    await renderPhoto(await source(cmyk, 'in.jpg'), out, testImagingConfig)

    const master = await meta(out.master)
    expect(master.space).toBe('srgb')
    expect(master.channels).toBe(3)
  })

  it('keeps the colour profile of an sRGB-tagged photo, as the Python worker did', async () => {
    const p3 = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#336699' } })
      .withIccProfile('p3')
      .png()
      .toBuffer()
    const out = outputs()
    await renderPhoto(await source(p3), out, testImagingConfig)

    expect((await meta(out.master)).icc).toBeDefined()
  })

  it('declares the pixel limit the Python worker had: a 120 MB TIFF passes, a decompression bomb does not', async () => {
    const { PIXEL_LIMIT } = await import('./imaging')
    expect(PIXEL_LIMIT).toBe(300_000_000)
  })

  it('fails with a message on a file that is not an image', async () => {
    const out = outputs()
    await expect(renderPhoto(await source(Buffer.from('not an image'), 'in.jpg'), out, testImagingConfig)).rejects.toThrow()
  })
})

describe('cutRenditions', () => {
  it('cuts the three widths from an existing master, never enlarging a small one', async () => {
    const master = join(dir, 'master.avif')
    await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#336699' } }).avif({ quality: 65, effort: 0 }).toFile(master)
    const paths = { 480: join(dir, 'a.avif'), 960: join(dir, 'b.avif'), 1600: join(dir, 'c.avif') }

    const size = await cutRenditions(master, paths, testImagingConfig)

    expect(size).toEqual({ width: 2400, height: 1600 })
    expect(await meta(paths[480])).toMatchObject({ width: 480, height: 320 })
    expect(await meta(paths[960])).toMatchObject({ width: 960, height: 640 })
    expect(await meta(paths[1600])).toMatchObject({ width: 1600, height: 1067 })
  })
})
