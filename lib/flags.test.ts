import { describe, it, expect } from 'vitest'
import { readFlags, FLAG_DEFAULTS, type FlagName } from './flags'

const names = Object.keys(FLAG_DEFAULTS) as FlagName[]

describe('readFlags', () => {
  it('turns every feature on when nothing is configured', () => {
    const flags = readFlags({})
    for (const name of names) expect(flags[name]).toBe(true)
  })

  it('turns a feature off with "off"', () => {
    expect(readFlags({ FEATURE_ROUTES: 'off' }).routes).toBe(false)
  })

  it('accepts the other spellings people actually type', () => {
    for (const value of ['0', 'false', 'no', 'OFF', ' off ']) {
      expect(readFlags({ FEATURE_ROUTES: value }).routes).toBe(false)
    }
  })

  it('treats an unrecognised value as on, so a typo never hides the site', () => {
    expect(readFlags({ FEATURE_ROUTES: 'disabled' }).routes).toBe(true)
    expect(readFlags({ FEATURE_ROUTES: '' }).routes).toBe(true)
  })

  it('leaves the other features alone when one is switched off', () => {
    const flags = readFlags({ FEATURE_ROUTE_PHOTOS: 'off' })
    expect(flags.routePhotos).toBe(false)
    expect(flags.routes).toBe(true)
    expect(flags.routeVideos).toBe(true)
  })

  it('switches off everything under routes when routes itself is off', () => {
    const flags = readFlags({ FEATURE_ROUTES: 'off' })
    expect(flags.routes).toBe(false)
    expect(flags.routePhotos).toBe(false)
    expect(flags.routeVideos).toBe(false)
    expect(flags.routeFlyover).toBe(false)
    expect(flags.routeGpxDownload).toBe(false)
  })
})
