import { XMLParser } from 'fast-xml-parser'

interface GpxStats {
  distanceKm: number
  elevationM: number
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
  const points: { lat: number; lon: number; ele: number }[] = (
    Array.isArray(rawPoints) ? rawPoints : [rawPoints]
  ).map((p: Record<string, unknown>) => ({
    lat: parseFloat(String(p['@_lat'] ?? 0)),
    lon: parseFloat(String(p['@_lon'] ?? 0)),
    ele: parseFloat(String(p['ele'] ?? 0)),
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

  return {
    distanceKm: Math.round(distanceKm * 10) / 10,
    elevationM: Math.round(elevationM),
  }
}

export function watermarkGpx(gpxString: string, routeName: string): string {
  const year = new Date().getFullYear()
  const metadata = `
  <metadata>
    <name>Percorso Lelettrica — ${routeName}</name>
    <author><name>Lelettrica di Leoni Gabriele</name></author>
    <copyright author="Lelettrica di Leoni Gabriele">
      <year>${year}</year>
      <license>Tutti i diritti riservati — www.lelettricaleoni.com</license>
    </copyright>
    <desc>File GPX di proprietà di Lelettrica. Vietata la riproduzione senza autorizzazione. www.lelettricaleoni.com</desc>
  </metadata>`

  if (gpxString.includes('<metadata>')) {
    return gpxString.replace(/<metadata>[\s\S]*?<\/metadata>/, metadata)
  }
  return gpxString.replace(/(<gpx[^>]*>)/, `$1\n${metadata}`)
}
