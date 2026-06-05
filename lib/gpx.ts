import { XMLParser } from 'fast-xml-parser'

interface GpxStats {
  distanceKm: number
  elevationM: number
  durationMin?: number
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function parseGpxStats(gpxString: string): GpxStats {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })
  const obj = parser.parse(gpxString)

  const trkseg = obj?.gpx?.trk?.trkseg
  const rawPoints = trkseg?.trkpt ?? []
  const points: { lat: number; lon: number; ele: number; time?: string }[] = (
    Array.isArray(rawPoints) ? rawPoints : [rawPoints]
  ).map((p: Record<string, unknown>) => ({
    lat: parseFloat(String(p['@_lat'] ?? 0)),
    lon: parseFloat(String(p['@_lon'] ?? 0)),
    ele: parseFloat(String(p['ele'] ?? 0)),
    time: p['time'] ? String(p['time']) : undefined,
  }))

  let distanceKm = 0
  let elevationM = 0

  for (let i = 1; i < points.length; i++) {
    distanceKm += haversineKm(
      points[i - 1].lat, points[i - 1].lon,
      points[i].lat, points[i].lon
    )
    const diff = points[i].ele - points[i - 1].ele
    if (diff > 0) elevationM += diff
  }

  const timestamps = points
    .map((p) => p.time ? new Date(p.time).getTime() : NaN)
    .filter((t) => !isNaN(t))
  const durationMin = timestamps.length >= 2
    ? Math.round((timestamps[timestamps.length - 1] - timestamps[0]) / 60000)
    : undefined

  return {
    distanceKm: Math.round(distanceKm * 10) / 10,
    elevationM: Math.round(elevationM),
    durationMin,
  }
}

export function parseGpxPoints(gpxString: string): [number, number, number][] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })
  const obj = parser.parse(gpxString)
  const trkseg = obj?.gpx?.trk?.trkseg
  const rawPoints = trkseg?.trkpt ?? []
  const all: [number, number, number][] = (
    Array.isArray(rawPoints) ? rawPoints : [rawPoints]
  ).map((p: Record<string, unknown>) => [
    parseFloat(String(p['@_lon'] ?? 0)), // lon first — GeoJSON format
    parseFloat(String(p['@_lat'] ?? 0)),
    parseFloat(String(p['ele'] ?? 0)),
  ])
  if (all.length <= 2000) return all

  // Distance-based adaptive sampling: preserves more points on curves
  const target = 2000
  const totalDist = all.reduce((acc, p, i) => {
    if (i === 0) return 0
    const prev = all[i - 1]
    const dx = p[0] - prev[0], dy = p[1] - prev[1]
    return acc + Math.sqrt(dx * dx + dy * dy)
  }, 0)
  const step = totalDist / target
  const result: [number, number, number][] = [all[0]]
  let accumulated = 0
  for (let i = 1; i < all.length - 1; i++) {
    const prev = all[i - 1]
    const dx = all[i][0] - prev[0], dy = all[i][1] - prev[1]
    accumulated += Math.sqrt(dx * dx + dy * dy)
    if (accumulated >= step) {
      result.push(all[i])
      accumulated = 0
    }
  }
  result.push(all[all.length - 1])
  return result
}

export function watermarkGpx(gpxString: string, routeName: string): string {
  const year = new Date().getFullYear()
  const metadata = `
  <metadata>
    <name>Lelettrica Route — ${routeName}</name>
    <author><name>Lelettrica di Leoni Gabriele</name></author>
    <copyright author="Lelettrica di Leoni Gabriele">
      <year>${year}</year>
      <license>All rights reserved — www.lelettricaleoni.com</license>
    </copyright>
    <desc>GPX file owned by Lelettrica. Reproduction without permission is prohibited. www.lelettricaleoni.com</desc>
  </metadata>`

  if (gpxString.includes('<metadata>')) {
    return gpxString.replace(/<metadata>[\s\S]*?<\/metadata>/, metadata)
  }
  return gpxString.replace(/(<gpx[^>]*>)/, `$1\n${metadata}`)
}
