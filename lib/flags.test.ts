import { describe, it, expect } from 'vitest'
import { applyCascade, readDevOverrides, FLAG_DEFAULTS, type FlagName, type Flags } from './flags'

const allOn = (): Flags =>
  Object.fromEntries((Object.keys(FLAG_DEFAULTS) as FlagName[]).map((n) => [n, true])) as Flags

describe('applyCascade', () => {
  it('leaves the flags alone when the section is on', () => {
    const out = applyCascade({ ...allOn(), routePhotos: false })
    expect(out.routes).toBe(true)
    expect(out.routePhotos).toBe(false)
    expect(out.routeVideos).toBe(true)
  })

  it('switches off everything under routes when routes itself is off', () => {
    const out = applyCascade({ ...allOn(), routes: false })
    expect(out.routes).toBe(false)
    expect(out.routePhotos).toBe(false)
    expect(out.routeVideos).toBe(false)
    expect(out.routeFlyover).toBe(false)
    expect(out.routeGpxDownload).toBe(false)
  })

  it('does not mutate its argument', () => {
    const input = { ...allOn(), routes: false }
    applyCascade(input)
    expect(input.routePhotos).toBe(true)
  })
})

describe('readDevOverrides', () => {
  it('returns nothing when no variable is set', () => {
    expect(readDevOverrides({})).toEqual({})
  })

  it('reads an override that switches a flag off', () => {
    expect(readDevOverrides({ FEATURE_ROUTES: 'off' })).toEqual({ routes: false })
  })

  it('reads an override that forces a flag on', () => {
    expect(readDevOverrides({ FEATURE_ROUTES: 'on' })).toEqual({ routes: true })
  })

  it('accepts the spellings people actually type', () => {
    for (const value of ['0', 'false', 'no', 'OFF', ' off ']) {
      expect(readDevOverrides({ FEATURE_ROUTES: value })).toEqual({ routes: false })
    }
    for (const value of ['1', 'true', 'yes', 'ON', ' on ']) {
      expect(readDevOverrides({ FEATURE_ROUTES: value })).toEqual({ routes: true })
    }
  })

  it('ignores a value it does not recognise, so a typo overrides nothing', () => {
    expect(readDevOverrides({ FEATURE_ROUTES: 'disabled' })).toEqual({})
    expect(readDevOverrides({ FEATURE_ROUTES: '' })).toEqual({})
  })

  it('reads each flag from its own variable', () => {
    expect(
      readDevOverrides({ FEATURE_ROUTE_PHOTOS: 'off', FEATURE_ROUTE_FLYOVER: 'off' })
    ).toEqual({ routePhotos: false, routeFlyover: false })
  })
})
