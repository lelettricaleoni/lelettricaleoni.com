import { eq } from 'drizzle-orm'
import { db, media } from '@/lib/db'
import type { Route } from '@/lib/db'
import { resolveReadyMedia } from '@/lib/media'
import { loadGpxPoints } from '@/lib/route-gpx'
import { gpxPointsToSvgPath, gpxPointsToMercatorPath, gpxBboxCenter } from '@/lib/gpx-svg'
import { CardMedia } from './card-media'

interface RouteCardMediaAsyncProps {
  route: Route
  routeName: string
}

// Resolves cover media (skipping videos whose HLS isn't ready and photos the worker hasn't finished) and the GPX map preview —
// the two checks that hit MinIO/R2 and can be slow or unreachable. Rendered inside a
// Suspense boundary per card so a slow/down media backend can't block the rest of the page.
export async function RouteCardMediaAsync({ route, routeName }: RouteCardMediaAsyncProps) {
  const mediaItems = await db
    .select()
    .from(media)
    .where(eq(media.routeId, route.id))
    .orderBy(media.displayOrder)

  const [coverMedia] = await resolveReadyMedia(mediaItems)

  // Computed whether or not there's a photo/video: the list-wide media↔map
  // toggle needs every card able to show its track, not only the ones that
  // had nothing else to show. loadGpxPoints is cached for a week per route
  // version, so a route with a cover photo now pays one Redis read it
  // previously skipped entirely — not a second R2 download.
  let gpxPath: string | undefined
  let mapCenter: { lat: number; lon: number; zoom: number } | undefined
  if (route.gpxKey) {
    const pts = await loadGpxPoints(route.gpxKey, route.updatedAt)
    if (pts.length > 0) {
      mapCenter = gpxBboxCenter(pts)
      gpxPath = mapCenter
        ? gpxPointsToMercatorPath(pts, mapCenter.zoom, mapCenter.lat, mapCenter.lon)
        : gpxPointsToSvgPath(pts)
    }
  }

  return (
    <CardMedia
      media={coverMedia}
      gpxPath={gpxPath}
      mapCenter={mapCenter}
      difficulty={route.difficulty}
      title={routeName}
    />
  )
}
