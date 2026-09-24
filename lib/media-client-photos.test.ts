import { describe, it, expect } from 'vitest'
import {
  isStagedPhotoKey, photoPublicKey, photoUrl, photoSourceExtension, photoContentType,
  PHOTO_SOURCE_EXTENSIONS,
} from './media-client'

// These pairs are the same ones tests/test_imaging.py pins in the worker
// repository. If one side changes and not the other, a photo is processed into a
// place the site never looks.
const PAIRS: [string, string][] = [
  ['private/route-photos/r1/u1.jpg', 'public/route-photos/r1/u1.avif'],
  ['private/route-photos/r1/u1.HEIC', 'public/route-photos/r1/u1.avif'],
  ['private/bike-model-photos/m1/u.2.tiff', 'public/bike-model-photos/m1/u.2.avif'],
]

describe('photoPublicKey', () => {
  it.each(PAIRS)('%s → %s', (staged, expected) => {
    expect(photoPublicKey(staged)).toBe(expected)
  })

  it('leaves a photo that predates the worker exactly where it is', () => {
    expect(photoPublicKey('route-photos/r1/u1.jpg')).toBe('route-photos/r1/u1.jpg')
    expect(photoPublicKey('bike-model-photos/m1/u1.png')).toBe('bike-model-photos/m1/u1.png')
  })

  it('does not treat a video source as a photo', () => {
    expect(photoPublicKey('private/route-videos/r1/u1.mp4')).toBe('private/route-videos/r1/u1.mp4')
  })
})

describe('isStagedPhotoKey', () => {
  it('is true only for the two staging prefixes', () => {
    expect(isStagedPhotoKey('private/route-photos/r1/u1.jpg')).toBe(true)
    expect(isStagedPhotoKey('private/bike-model-photos/m1/u1.jpg')).toBe(true)
    expect(isStagedPhotoKey('route-photos/r1/u1.jpg')).toBe(false)
    expect(isStagedPhotoKey('public/route-photos/r1/u1.avif')).toBe(false)
    expect(isStagedPhotoKey('private/route-videos/r1/u1.mp4')).toBe(false)
  })
})

describe('photoUrl', () => {
  it('points a staged photo at its master', () => {
    expect(photoUrl('private/route-photos/r1/u1.jpg').endsWith('/public/route-photos/r1/u1.avif')).toBe(true)
  })

  it('points a legacy photo at itself', () => {
    expect(photoUrl('route-photos/r1/u1.jpg').endsWith('/route-photos/r1/u1.jpg')).toBe(true)
  })
})

describe('photoSourceExtension', () => {
  it('accepts every format the worker decodes, in any case', () => {
    for (const ext of PHOTO_SOURCE_EXTENSIONS) {
      expect(photoSourceExtension(`IMG_0001.${ext.toUpperCase()}`)).toBe(ext)
    }
  })

  it('takes the last extension of a name with dots', () => {
    expect(photoSourceExtension('holiday.2026.08.heic')).toBe('heic')
  })

  it('rejects what the worker would leave in staging forever', () => {
    expect(photoSourceExtension('animation.gif')).toBeNull()
    expect(photoSourceExtension('vector.svg')).toBeNull()
    expect(photoSourceExtension('photo')).toBeNull()
    expect(photoSourceExtension('clip.mp4')).toBeNull()
  })
})

describe('photoContentType', () => {
  it('has a value for every accepted extension', () => {
    for (const ext of PHOTO_SOURCE_EXTENSIONS) {
      expect(photoContentType(ext)).toMatch(/^image\//)
    }
    expect(photoContentType('tif')).toBe('image/tiff')
    expect(photoContentType('heic')).toBe('image/heic')
  })
})
