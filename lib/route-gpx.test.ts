import { describe, it, expect } from 'vitest'
import { gpxPointsKey, gpxPointsTtl } from './route-gpx'

describe('gpxPointsKey', () => {
  it('includes the version of the route, so replacing a GPX invalidates the cache', () => {
    const a = gpxPointsKey('route-gpx/abc/track.gpx', new Date('2026-01-01T00:00:00Z'))
    const b = gpxPointsKey('route-gpx/abc/track.gpx', new Date('2026-02-01T00:00:00Z'))
    expect(a).not.toBe(b)
  })

  it('is stable for the same file and version', () => {
    const at = new Date('2026-01-01T00:00:00Z')
    expect(gpxPointsKey('k', at)).toBe(gpxPointsKey('k', at))
  })
})

describe('gpxPointsTtl', () => {
  it('keeps a parsed track for a week', () => {
    expect(gpxPointsTtl([[1, 2, 3]])).toBe(7 * 24 * 60 * 60)
  })

  // An empty result means the download or parse failed. Caching that would hide
  // a route's map long after R2 recovered.
  it('does not cache a failure', () => {
    expect(gpxPointsTtl([])).toBe(0)
  })
})
