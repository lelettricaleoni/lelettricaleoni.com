import { describe, it, expect } from 'vitest'
import { photoLoader, isMasterUrl, renditionUrl, RENDITION_WIDTHS } from './photo-loader'

const CDN = 'https://cdn.test'
const MASTER = `${CDN}/public/bike-model-photos/m1/u1.avif`

// Same pairs as the worker's tests/test_imaging.py (rendition_key_for), as URLs.
describe('renditionUrl', () => {
  it('replaces the master extension with the width', () => {
    expect(renditionUrl(`${CDN}/public/route-photos/r1/u1.avif`, 480)).toBe(`${CDN}/public/route-photos/r1/u1.w480.avif`)
    expect(renditionUrl(`${CDN}/public/bike-model-photos/m1/u.2.avif`, 960)).toBe(`${CDN}/public/bike-model-photos/m1/u.2.w960.avif`)
  })

  it('agrees with the worker on the widths', () => {
    expect([...RENDITION_WIDTHS]).toEqual([480, 960, 1600])
  })
})

describe('isMasterUrl', () => {
  it('is true for a worker master', () => {
    expect(isMasterUrl(MASTER)).toBe(true)
    expect(isMasterUrl(`${CDN}/public/route-photos/r1/u1.avif`)).toBe(true)
  })

  it('is false for a rendition, a share JPEG and a photo that predates the worker', () => {
    expect(isMasterUrl(`${CDN}/public/bike-model-photos/m1/u1.w480.avif`)).toBe(false)
    expect(isMasterUrl(`${CDN}/public/bike-model-photos/m1/u1.share.jpg`)).toBe(false)
    expect(isMasterUrl(`${CDN}/bike-model-photos/m1/u1.jpg`)).toBe(false)
    expect(isMasterUrl(`${CDN}/route-photos/r1/u1.webp`)).toBe(false)
  })

  it('is false for something that is not a URL', () => {
    expect(isMasterUrl('')).toBe(false)
  })
})

describe('photoLoader — a master', () => {
  // The widths next/image really asks for: imageSizes then deviceSizes.
  it.each([
    [16, 480], [96, 480], [256, 480], [384, 480], [480, 480],
    [640, 960], [750, 960], [828, 960], [960, 960],
    [1080, 1600], [1200, 1600], [1600, 1600],
  ])('at %ipx asks for the %ipx rendition', (asked, got) => {
    expect(photoLoader({ src: MASTER, width: asked })).toBe(`${CDN}/public/bike-model-photos/m1/u1.w${got}.avif`)
  })

  it.each([1920, 2048, 3840])('at %ipx, wider than any rendition, serves the master itself', (asked) => {
    expect(photoLoader({ src: MASTER, width: asked })).toBe(MASTER)
  })

  it('never goes through the optimizer', () => {
    for (const w of [128, 640, 1080, 3840]) {
      expect(photoLoader({ src: MASTER, width: w })).not.toContain('/_next/image')
    }
  })
})

describe('photoLoader — a photo that predates the worker', () => {
  it("goes through Next's optimizer, which resizes JPEG, PNG and WebP", () => {
    const legacy = `${CDN}/bike-model-photos/m1/u1.jpg`
    expect(photoLoader({ src: legacy, width: 384, quality: 68 }))
      .toBe(`/_next/image?url=${encodeURIComponent(legacy)}&w=384&q=68`)
  })

  it('falls back to quality 75', () => {
    expect(photoLoader({ src: `${CDN}/route-photos/r1/u1.webp`, width: 640 })).toContain('&q=75')
  })
})
