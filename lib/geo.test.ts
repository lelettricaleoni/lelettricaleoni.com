import { describe, it, expect } from 'vitest'
import { haversineKm, cumulativeDistancesKm } from './geo'

describe('haversineKm', () => {
  it('is zero for the same point', () => {
    expect(haversineKm(45, 10, 45, 10)).toBe(0)
  })

  it('matches the known distance for one degree of latitude', () => {
    // ~111.19 km per degree of latitude, at any longitude
    expect(haversineKm(0, 0, 1, 0)).toBeCloseTo(111.19, 1)
  })
})

describe('cumulativeDistancesKm', () => {
  it('starts at zero', () => {
    const out = cumulativeDistancesKm([[10, 45, 0], [10, 46, 0]])
    expect(out[0]).toBe(0)
  })

  it('returns one value per point, monotonically increasing along a straight track', () => {
    const points: [number, number, number][] = [[10, 45, 0], [10, 45.1, 0], [10, 45.2, 0]]
    const out = cumulativeDistancesKm(points)
    expect(out).toHaveLength(3)
    expect(out[1]).toBeGreaterThan(out[0])
    expect(out[2]).toBeGreaterThan(out[1])
  })

  it('handles a single point without dividing by anything', () => {
    expect(cumulativeDistancesKm([[10, 45, 0]])).toEqual([0])
  })

  it('handles an empty track', () => {
    expect(cumulativeDistancesKm([])).toEqual([])
  })
})
