import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { checkMediaContent } from './media-content'

const file = (bytes: Uint8Array | Buffer, name: string) => new File([new Uint8Array(bytes)], name)

describe('checkMediaContent, photos', () => {
  it('accepts what each accepted format really is, whatever the case of the name', async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#336699' } }).png().toBuffer()
    const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#336699' } }).jpeg().toBuffer()
    const webp = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#336699' } }).webp().toBuffer()
    const tiff = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#336699' } }).tiff().toBuffer()
    const heic = readFileSync(join(__dirname, '..', 'worker', 'fixtures', 'sample.heic'))
    for (const [bytes, name] of [[png, 'a.png'], [jpeg, 'IMG_1.JPG'], [webp, 'a.webp'], [tiff, 'a.tif'], [heic, 'phone.HEIC']] as const) {
      expect(await checkMediaContent(file(bytes, name), 'photo')).toEqual({ ok: true })
    }
  })

  it('refuses a PNG whose first byte was replaced, the way the corrupt files of 2026-10-06 were', async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#336699' } }).png().toBuffer()
    const broken = Buffer.concat([Buffer.from([0xef, 0xbf, 0xbd]), png.subarray(1)])
    const result = await checkMediaContent(file(broken, 'broken.png'), 'photo')
    expect(result.ok).toBe(false)
  })

  it('refuses a file that is not an image at all, and an empty one', async () => {
    expect((await checkMediaContent(file(Buffer.from('just some text'), 'notes.jpg'), 'photo')).ok).toBe(false)
    expect((await checkMediaContent(file(Buffer.alloc(0), 'empty.png'), 'photo')).ok).toBe(false)
  })

  it('refuses an image format the worker cannot read, even under an accepted extension', async () => {
    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
    expect((await checkMediaContent(file(gif, 'animated.png'), 'photo')).ok).toBe(false)
  })

  it('says what is wrong in words a person can act on, without naming any technology', async () => {
    const result = await checkMediaContent(file(Buffer.from('nope'), 'x.png'), 'photo')
    expect(result).toEqual({ ok: false, reason: expect.stringMatching(/not a valid photo/i) })
    if (!result.ok) expect(result.reason).not.toMatch(/R2|worker|Redis|sharp|ffmpeg/i)
  })
})

describe('checkMediaContent, videos', () => {
  // The start of a real MP4: a `ftyp` box with the `isom` brand.
  const mp4Head = Buffer.from('00000020667479706973 6f6d0000020069736f6d69736f32617663316d703431'.replace(/ /g, ''), 'hex')

  it('accepts a video container', async () => {
    expect(await checkMediaContent(file(mp4Head, 'clip.mp4'), 'video')).toEqual({ ok: true })
  })

  it('refuses a photo or a text file uploaded as a video', async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#336699' } }).png().toBuffer()
    expect((await checkMediaContent(file(png, 'clip.mp4'), 'video')).ok).toBe(false)
    expect((await checkMediaContent(file(Buffer.from('not a video'), 'clip.mp4'), 'video')).ok).toBe(false)
  })
})
