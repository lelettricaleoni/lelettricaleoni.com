/**
 * Helpers for anchoring a GPX track to 3D terrain.
 *
 * GPX elevations are orthometric (metres above mean sea level) while Cesium
 * positions and terrain heights are ellipsoidal (metres above the WGS84
 * ellipsoid). Around Trento the two differ by roughly 46 m, which buries the
 * track under the terrain; DEM resolution and GPS error add another ~30 m of
 * scatter on top. Rather than converting between the two references, we drop
 * the GPX elevation for rendering and re-anchor the track to the terrain
 * height sampled underneath it.
 *
 * Sampling every point would mean thousands of terrain queries, so we sample a
 * bounded subset and interpolate the rest.
 */

/**
 * Evenly spaced indices into a track of `n` points, at most `max` of them,
 * always including the first and last point.
 */
export function pickSampleIndices(n: number, max: number): number[] {
  if (n <= 0) return []
  if (n === 1) return [0]
  if (n <= max) return Array.from({ length: n }, (_, i) => i)

  const indices: number[] = []
  for (let k = 0; k < max; k++) {
    const i = Math.round((k * (n - 1)) / (max - 1))
    if (indices[indices.length - 1] !== i) indices.push(i)
  }
  return indices
}

/**
 * Expand sparse terrain heights sampled at `indices` into a height for each of
 * the `n` track points, interpolating linearly in between and clamping to the
 * nearest sample outside the sampled range.
 *
 * Samples whose height is not finite are skipped — `sampleTerrainMostDetailed`
 * leaves the height undefined where a terrain tile fails to load. Returns an
 * empty array when no sample is usable, which callers treat as "no terrain".
 */
export function interpolateHeights(n: number, indices: number[], heights: number[]): number[] {
  if (n <= 0) return []

  const known: Array<{ index: number; height: number }> = []
  for (let k = 0; k < indices.length; k++) {
    const height = heights[k]
    if (Number.isFinite(height)) known.push({ index: indices[k], height })
  }
  if (known.length === 0) return []
  if (known.length === 1) return new Array(n).fill(known[0].height)

  const out = new Array<number>(n)
  let segment = 0
  for (let i = 0; i < n; i++) {
    while (segment < known.length - 2 && known[segment + 1].index < i) segment++
    const a = known[segment]
    const b = known[segment + 1]
    if (i <= a.index) {
      out[i] = a.height
    } else if (i >= b.index) {
      out[i] = b.height
    } else {
      const t = (i - a.index) / (b.index - a.index)
      out[i] = a.height + (b.height - a.height) * t
    }
  }
  return out
}
