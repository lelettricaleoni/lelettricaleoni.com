// lib/media/keys.test.ts
import { describe, expect, it } from 'vitest'
import {
  RENDITION_WIDTHS, deriveHlsPrefix, extensionOf, isMasterKey, isPhotoSourceKey, isStagedPhotoKey, isVideoSourceKey,
  photoMasterKeyFor, photoPublicKey, photoRenditionKey, photoRenditionKeys, photoShareKey,
} from './keys'

// The same pairs the Python worker's tests pinned (tests/test_imaging.py and tests/test_transcode_prefixes.py):
// if the site and the worker ever disagree, a file is written where nobody looks.
describe('photo keys', () => {
  it.each([
    ['private/route-photos/r1/u1.jpg', 'public/route-photos/r1/u1.avif'],
    ['private/route-photos/r1/u1.HEIC', 'public/route-photos/r1/u1.avif'],
    ['private/bike-model-photos/m1/u.2.tiff', 'public/bike-model-photos/m1/u.2.avif'],
  ])('the master of %s is %s', (source, expected) => {
    expect(photoMasterKeyFor(source)).toBe(expected)
    expect(photoPublicKey(source)).toBe(expected)
  })

  it('refuses to make a master for a key that is not in staging', () => {
    expect(() => photoMasterKeyFor('route-photos/r1/u1.jpg')).toThrow(/not a staging key/)
  })

  it('leaves a key that is already public untouched', () => {
    expect(photoPublicKey('public/route-photos/r1/old.jpg')).toBe('public/route-photos/r1/old.jpg')
  })

  it.each([
    ['private/route-photos/r1/u1.jpg', 'public/route-photos/r1/u1.share.jpg'],
    ['private/bike-model-photos/m1/u.2.tiff', 'public/bike-model-photos/m1/u.2.share.jpg'],
  ])('the link preview of %s is %s', (source, expected) => {
    expect(photoShareKey(source)).toBe(expected)
  })

  it.each([
    ['private/route-photos/r1/u1.jpg', 480, 'public/route-photos/r1/u1.w480.avif'],
    ['private/bike-model-photos/m1/u.2.tiff', 960, 'public/bike-model-photos/m1/u.2.w960.avif'],
    ['private/route-photos/r1/u1.png', 1600, 'public/route-photos/r1/u1.w1600.avif'],
  ])('the %s rendition of %s', (source, width, expected) => {
    expect(photoRenditionKey(photoMasterKeyFor(source), width)).toBe(expected)
  })

  it('lists every rendition of a staged photo, and none for one that predates the worker', () => {
    expect(photoRenditionKeys('private/route-photos/r1/u1.jpg')).toEqual([
      'public/route-photos/r1/u1.w480.avif',
      'public/route-photos/r1/u1.w960.avif',
      'public/route-photos/r1/u1.w1600.avif',
    ])
    expect(photoRenditionKeys('public/route-photos/r1/old.jpg')).toEqual([])
  })

  it('has the widths the site picks among', () => {
    expect([...RENDITION_WIDTHS]).toEqual([480, 960, 1600])
  })

  it.each([
    'private/route-photos/r1/u1.jpg',
    'private/route-photos/r1/u1.JPEG',
    'private/route-photos/r1/u1.tif',
    'private/bike-model-photos/m1/u1.heif',
    'private/bike-model-photos/m1/u1.webp',
    'private/route-photos/r1/IMG_0001.HEIC',
  ])('accepts %s as a photo source, whatever the case of the extension', (key) => {
    expect(isPhotoSourceKey(key)).toBe(true)
  })

  it.each([
    'private/route-videos/r1/u1.mp4',
    'private/route-photos/r1/u1.gif',
    'private/route-photos/r1/u1.avif',
    'private/route-photos/r1/noextension',
    'public/route-photos/r1/u1.avif',
    'route-photos/r1/u1.jpg',
  ])('does not accept %s as a photo source', (key) => {
    expect(isPhotoSourceKey(key)).toBe(false)
  })

  it('knows a staged photo by its prefix alone', () => {
    expect(isStagedPhotoKey('private/route-photos/r1/anything')).toBe(true)
    expect(isStagedPhotoKey('public/route-photos/r1/u1.avif')).toBe(false)
  })

  it.each([
    'public/route-photos/r1/u1.avif',
    'public/bike-model-photos/m1/u.2.avif',
  ])('%s is a master', (key) => {
    expect(isMasterKey(key)).toBe(true)
  })

  it.each([
    'public/route-photos/r1/u1.w480.avif',
    'public/route-photos/r1/u1.w1600.avif',
    'public/route-photos/r1/u1.share.jpg',
    'public/route-photos/r1/u1.jpg',
    'public/route-videos/r1/u1/master.m3u8',
    'private/route-photos/r1/u1.avif',
    'route-photos/r1/u1.avif',
  ])('%s is not a master', (key) => {
    expect(isMasterKey(key)).toBe(false)
  })

  it('refuses to name a rendition of something that is not a master', () => {
    expect(() => photoRenditionKey('public/route-photos/r1/u1.w480.avif', 960)).toThrow(/not a master/)
  })
})

describe('video keys', () => {
  it.each([
    ['private/route-videos/r1/u1.mp4', 'public/route-videos/r1/u1/'],
    ['private/bike-model-videos/m1/u1.mov', 'public/bike-model-videos/m1/u1/'],
    ['private/bike-model-videos/m1/a.b.c.mp4', 'public/bike-model-videos/m1/a.b.c/'],
    // Only the leading private/ changes, not a folder that happens to be called private further down.
    ['private/bike-model-videos/private/u1.mp4', 'public/bike-model-videos/private/u1/'],
  ])('the stream of %s lives under %s', (source, expected) => {
    expect(deriveHlsPrefix(source)).toBe(expected)
  })

  it.each([
    'private/route-videos/r1/u1.mp4',
    'private/route-videos/r1/U1.MP4',
    'private/bike-model-videos/m1/u1.MOV',
    'private/bike-model-videos/m1/u1.webm',
  ])('accepts %s as a video source', (key) => {
    expect(isVideoSourceKey(key)).toBe(true)
  })

  it.each([
    'private/route-videos/r1/u1.txt',
    'private/route-videos/r1/noextension',
    'private/route-photos/r1/u1.jpg',
    'public/route-videos/r1/u1/master.m3u8',
  ])('does not accept %s as a video source', (key) => {
    expect(isVideoSourceKey(key)).toBe(false)
  })
})

describe('extensionOf', () => {
  it('lower-cases the extension of the last path segment only', () => {
    expect(extensionOf('private/route-photos/r.1/u1.JPG')).toBe('jpg')
    expect(extensionOf('private/route-photos/r.1/u1')).toBe('')
    expect(extensionOf('a/b/c.d.e')).toBe('e')
  })
})
