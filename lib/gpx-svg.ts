// Web Mercator pixel coords at a given zoom — same projection the XYZ tile grid uses,
// so a path built from this lines up with the raster tiles instead of a bbox-stretched approximation.
function mercatorPixel(lat: number, lon: number, zoom: number) {
  const n = Math.pow(2, zoom) * 256
  const x = (lon + 180) / 360 * n
  const sinLat = Math.sin(lat * Math.PI / 180)
  const y = (1 - Math.log((1 + sinLat) / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n
  return { x, y }
}

// Card map area is a fixed 192px-tall box (route-card.tsx `h-48`); keep the target well inside
// that so the whole route stays clear of the card edges at any card width.
const CARD_MAP_TARGET_W = 220
const CARD_MAP_TARGET_H = 140

export function gpxBboxCenter(points: [number, number, number][]): { lat: number; lon: number; zoom: number } | undefined {
  if (points.length < 2) return undefined
  const lons = points.map((p) => p[0])
  const lats = points.map((p) => p[1])
  const minLon = Math.min(...lons), maxLon = Math.max(...lons)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const lat = (minLat + maxLat) / 2
  const lon = (minLon + maxLon) / 2

  // Measure the bbox in real Mercator pixels at a reference zoom, then pick the highest zoom
  // at which it still projects to within the target box — pixel size doubles per zoom level.
  const refZoom = 14
  const corner1 = mercatorPixel(minLat, minLon, refZoom)
  const corner2 = mercatorPixel(maxLat, maxLon, refZoom)
  const pixelW = Math.abs(corner2.x - corner1.x) || 1
  const pixelH = Math.abs(corner2.y - corner1.y) || 1
  const zoomForW = refZoom + Math.log2(CARD_MAP_TARGET_W / pixelW)
  const zoomForH = refZoom + Math.log2(CARD_MAP_TARGET_H / pixelH)
  const z = Math.floor(Math.min(zoomForW, zoomForH))

  return { lat, lon, zoom: Math.min(Math.max(z, 7), 16) }
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

// SVG path in pixels relative to (centerLat, centerLon) at `zoom`, meant to be drawn on top of
// the 3×3 tile grid centered on that same point (see route-card-media.tsx).
export function gpxPointsToMercatorPath(
  points: [number, number, number][],
  zoom: number,
  centerLat: number,
  centerLon: number
): string {
  if (points.length < 2) return ''
  const center = mercatorPixel(centerLat, centerLon, zoom)
  return points
    .map((p, i) => {
      const { x, y } = mercatorPixel(p[1], p[0], zoom)
      return `${i === 0 ? 'M' : 'L'}${(x - center.x).toFixed(1)},${(y - center.y).toFixed(1)}`
    })
    .join(' ')
}
