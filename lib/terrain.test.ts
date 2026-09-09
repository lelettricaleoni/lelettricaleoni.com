import { describe, it, expect } from 'vitest'
import { pickSampleIndices, interpolateHeights } from './terrain'

describe('pickSampleIndices', () => {
  it('returns every index when the track is shorter than the cap', () => {
    expect(pickSampleIndices(4, 10)).toEqual([0, 1, 2, 3])
  })

  it('always includes the first and last point', () => {
    const idx = pickSampleIndices(1000, 50)
    expect(idx[0]).toBe(0)
    expect(idx[idx.length - 1]).toBe(999)
  })

  it('respects the cap and returns strictly ascending indices', () => {
    const idx = pickSampleIndices(1000, 50)
    expect(idx.length).toBeLessThanOrEqual(50)
    expect(idx).toEqual([...idx].sort((a, b) => a - b))
    expect(new Set(idx).size).toBe(idx.length)
  })

  it('handles degenerate track lengths', () => {
    expect(pickSampleIndices(0, 10)).toEqual([])
    expect(pickSampleIndices(1, 10)).toEqual([0])
  })
})

describe('interpolateHeights', () => {
  it('reproduces the sampled heights at the sampled indices', () => {
    const out = interpolateHeights(5, [0, 4], [100, 200])
    expect(out[0]).toBe(100)
    expect(out[4]).toBe(200)
  })

  it('interpolates linearly between samples', () => {
    const out = interpolateHeights(5, [0, 4], [100, 200])
    expect(out).toEqual([100, 125, 150, 175, 200])
  })

  it('clamps to the nearest sample outside the sampled range', () => {
    const out = interpolateHeights(5, [1, 3], [100, 200])
    expect(out[0]).toBe(100)
    expect(out[4]).toBe(200)
  })

  // sampleTerrainMostDetailed leaves height undefined where a tile fails to load
  it('interpolates across samples whose height is not finite', () => {
    const out = interpolateHeights(5, [0, 2, 4], [100, NaN, 200])
    expect(out).toEqual([100, 125, 150, 175, 200])
  })

  it('returns an empty array for an empty track', () => {
    expect(interpolateHeights(0, [], [])).toEqual([])
  })

  it('returns an empty array when no sample has a usable height', () => {
    expect(interpolateHeights(3, [0, 2], [NaN, NaN])).toEqual([])
  })
})
