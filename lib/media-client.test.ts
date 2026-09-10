import { describe, it, expect } from 'vitest'
import { deriveHlsPrefix, hlsUrl, HLS_MANIFESTS } from './media-client'

describe('deriveHlsPrefix', () => {
  it('moves private/ to public/ and strips the extension', () => {
    expect(deriveHlsPrefix('private/route-videos/abc/def.mp4')).toBe('public/route-videos/abc/def/')
  })

  it('handles any extension', () => {
    expect(deriveHlsPrefix('private/route-videos/abc/def.MOV')).toBe('public/route-videos/abc/def/')
    expect(deriveHlsPrefix('private/route-videos/abc/def.webm')).toBe('public/route-videos/abc/def/')
  })

  it('leaves dots inside the id alone', () => {
    expect(deriveHlsPrefix('private/route-videos/abc/d.e.f.mp4')).toBe('public/route-videos/abc/d.e.f/')
  })
})

describe('HLS_MANIFESTS', () => {
  // The worker emitted a flat playlist.m3u8 until 2026-06-10 and master.m3u8 with
  // per-rendition folders after. Videos of both vintages are live, so dropping
  // either name would make one set of them look like it never finished processing.
  it('accepts both the adaptive and the legacy manifest', () => {
    expect([...HLS_MANIFESTS]).toEqual(['master.m3u8', 'playlist.m3u8'])
  })

  it('prefers the adaptive manifest', () => {
    expect(HLS_MANIFESTS[0]).toBe('master.m3u8')
  })
})

describe('hlsUrl', () => {
  it('builds the URL for a given manifest', () => {
    const url = hlsUrl('private/route-videos/abc/def.mp4', 'master.m3u8')
    expect(url.endsWith('public/route-videos/abc/def/master.m3u8')).toBe(true)
  })

  it('falls back to the legacy manifest when none is named', () => {
    const url = hlsUrl('private/route-videos/abc/def.mp4')
    expect(url.endsWith('public/route-videos/abc/def/playlist.m3u8')).toBe(true)
  })
})
