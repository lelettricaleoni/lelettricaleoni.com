import { describe, expect, it } from 'vitest'
import { isTrackedJobKey } from './video-jobs'

describe('isTrackedJobKey', () => {
  it('accepts the staging keys the worker turns into something playable or viewable', () => {
    expect(isTrackedJobKey('private/route-videos/r/u.mp4')).toBe(true)
    expect(isTrackedJobKey('private/bike-model-videos/m/u.mov')).toBe(true)
    expect(isTrackedJobKey('private/route-photos/r/u.heic')).toBe(true)
    expect(isTrackedJobKey('private/bike-model-photos/m/u.tif')).toBe(true)
  })

  it('rejects everything else, and anything that is not a string', () => {
    expect(isTrackedJobKey('route-photos/r/u.jpg')).toBe(false)
    expect(isTrackedJobKey('public/route-photos/r/u.avif')).toBe(false)
    expect(isTrackedJobKey('__worker__')).toBe(false)
    expect(isTrackedJobKey('hls:v2:private/route-videos/r/u.mp4')).toBe(false)
    expect(isTrackedJobKey(42)).toBe(false)
    expect(isTrackedJobKey(undefined)).toBe(false)
  })
})
