import { GetObjectCommand } from '@aws-sdk/client-s3'
import { s3, R2_BUCKET } from './r2'
import { parseGpxPoints } from './gpx'
import { readThrough } from './cache'

/** A stored GPX never changes; replacing it changes the route's updatedAt. */
const GPX_POINTS_TTL_S = 7 * 24 * 60 * 60

/**
 * How long to keep a parsed track.
 *
 * An empty result means the download or the parse failed, and caching that for
 * a week would hide a route's map long after R2 recovered. Failures are not
 * cached at all.
 */
export function gpxPointsTtl(points: unknown[]): number {
  return points.length > 0 ? GPX_POINTS_TTL_S : 0
}

/** Cache key for a route's parsed track. */
export function gpxPointsKey(gpxKey: string, updatedAt: Date): string {
  return `gpx:v1:${gpxKey}:${updatedAt.toISOString()}`
}

/**
 * The route's track as [lon, lat, ele] triples, downloaded from R2 and parsed
 * once per version rather than on every request.
 *
 * Both the detail page and each card in the list need this, and every page here
 * renders on demand, so without the cache a six-route list means six R2
 * downloads and six parses per visit.
 *
 * Returns an empty array when the object is missing or unreadable: a route
 * without a usable track still renders, just without its map.
 */
export async function loadGpxPoints(
  gpxKey: string,
  updatedAt: Date
): Promise<[number, number, number][]> {
  return readThrough(
    gpxPointsKey(gpxKey, updatedAt),
    async () => {
      try {
        const res = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: gpxKey }))
        const chunks: Buffer[] = []
        for await (const chunk of res.Body as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk))
        return parseGpxPoints(Buffer.concat(chunks).toString('utf-8'))
      } catch (err) {
        console.error(`[route-gpx] could not read ${gpxKey}:`, err)
        return [] as [number, number, number][]
      }
    },
    gpxPointsTtl
  )
}
