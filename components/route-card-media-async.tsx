import { eq } from 'drizzle-orm'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { db, routePhotos } from '@/lib/db'
import type { Route } from '@/lib/db'
import { s3, R2_BUCKET } from '@/lib/r2'
import { minioObjectExists, deriveHlsPrefix } from '@/lib/minio'
import { parseGpxPoints } from '@/lib/gpx'
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
      const ready = await minioObjectExists(deriveHlsPrefix(m.storageKey) + 'playlist.m3u8')
      return ready ? m : null
    })
  )
  const coverMedia = readyMedia.find(Boolean) ?? undefined

  let gpxPath: string | undefined
  let mapCenter: { lat: number; lon: number; zoom: number } | undefined
  if (!coverMedia && route.gpxKey) {
    try {
      const res = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: route.gpxKey }))
      const chunks: Buffer[] = []
      for await (const chunk of res.Body as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk))
      const pts = parseGpxPoints(Buffer.concat(chunks).toString('utf-8'))
      mapCenter = gpxBboxCenter(pts)
      gpxPath = mapCenter
        ? gpxPointsToMercatorPath(pts, mapCenter.zoom, mapCenter.lat, mapCenter.lon)
        : gpxPointsToSvgPath(pts)
    } catch { /* silently skip */ }
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
