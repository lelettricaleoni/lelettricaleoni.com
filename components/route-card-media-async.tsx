import { eq } from 'drizzle-orm'
import { db, routePhotos } from '@/lib/db'
import type { Route } from '@/lib/db'
import { resolveHlsUrl } from '@/lib/media'
import { loadGpxPoints } from '@/lib/route-gpx'
import { gpxPointsToSvgPath, gpxPointsToMercatorPath, gpxBboxCenter } from '@/lib/gpx-svg'
import { RouteCardMedia } from './route-card-media'

interface RouteCardMediaAsyncProps {
  route: Route
  routeName: string
}

// Resolves cover media (skipping videos whose HLS isn't ready) and the GPX map preview —
// the two checks that hit MinIO/R2 and can be slow or unreachable. Rendered inside a
// Suspense boundary per card so a slow/down media backend can't block the rest of the page.
export async function RouteCardMediaAsync({ route, routeName }: RouteCardMediaAsyncProps) {
  const mediaItems = await db
    .select()
    .from(routePhotos)
    .where(eq(routePhotos.routeId, route.id))
    .orderBy(routePhotos.displayOrder)

  const readyMedia = await Promise.all(
    mediaItems.map(async (m) => {
      if (m.mediaType !== 'video') return m
      const hlsUrl = await resolveHlsUrl(m.storageKey)
      return hlsUrl ? { ...m, hlsUrl } : null
    })
  )
  const coverMedia = readyMedia.find(Boolean) ?? undefined

  let gpxPath: string | undefined
  let mapCenter: { lat: number; lon: number; zoom: number } | undefined
  if (!coverMedia && route.gpxKey) {
    const pts = await loadGpxPoints(route.gpxKey, route.updatedAt)
    if (pts.length > 0) {
      mapCenter = gpxBboxCenter(pts)
      gpxPath = mapCenter
        ? gpxPointsToMercatorPath(pts, mapCenter.zoom, mapCenter.lat, mapCenter.lon)
        : gpxPointsToSvgPath(pts)
    }
  }

  return (
    <RouteCardMedia
      media={coverMedia}
      gpxPath={gpxPath}
      mapCenter={mapCenter}
      difficulty={route.difficulty}
      routeName={routeName}
    />
  )
}
