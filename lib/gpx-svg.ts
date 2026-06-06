export function gpxBboxCenter(points: [number, number, number][]): { lat: number; lon: number; zoom: number } | undefined {
  if (points.length < 2) return undefined
  const lons = points.map((p) => p[0])
  const lats = points.map((p) => p[1])
  const minLon = Math.min(...lons), maxLon = Math.max(...lons)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const lat = (minLat + maxLat) / 2
  const lon = (minLon + maxLon) / 2
  // Choose zoom so the route fits in ~1.5 tiles of a 3×3 tile grid
  const span = Math.max(maxLon - minLon, maxLat - minLat)
  const z = span > 0 ? Math.round(Math.log2(540 / span)) : 12
  return { lat, lon, zoom: Math.min(Math.max(z, 10), 15) }
}

export function gpxPointsToSvgPath(points: [number, number, number][]): string {
  if (points.length < 2) return ''
  const lons = points.map((p) => p[0])
  const lats = points.map((p) => p[1])
  const minLon = Math.min(...lons), maxLon = Math.max(...lons)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const rangeX = maxLon - minLon || 1
  const rangeY = maxLat - minLat || 1
  const toX = (lon: number) => ((lon - minLon) / rangeX) * 200
  const toY = (lat: number) => ((maxLat - lat) / rangeY) * 200
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p[0]).toFixed(1)},${toY(p[1]).toFixed(1)}`)
    .join(' ')
}
