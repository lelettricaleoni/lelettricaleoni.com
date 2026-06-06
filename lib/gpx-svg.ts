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
