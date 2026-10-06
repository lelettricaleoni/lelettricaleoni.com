import type { Media } from './db'
import {
  HLS_MANIFESTS,
  PHOTO_SOURCE_EXTENSIONS,
  deriveHlsPrefix,
  photoPublicKey,
  photoShareKey,
  type PhotoSourceExtension,
} from './media/keys'

/**
 * Media URL helpers safe to import from client components.
 *
 * Everything here is a pure string transform over the public bucket URL, so it carries no credentials and no AWS SDK.
 * The key rules themselves (what a photo's master is called, where a video's stream lives) are in `./media/keys`, which
 * the media worker imports too; they are re-exported here so existing imports keep working. The server-side
 * counterparts, the ones that actually talk to R2, live in `./r2`.
 */

export {
  HLS_MANIFESTS,
  PHOTO_SOURCE_EXTENSIONS,
  PHOTO_STAGING_PREFIXES,
  deriveHlsPrefix,
  photoPublicKey,
  photoRenditionKeys,
  photoShareKey,
  type PhotoSourceExtension,
} from './media/keys'

export const MEDIA_PUBLIC_URL = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? '').replace(/\/$/, '')

export function mediaPublicUrl(key: string): string {
  return `${MEDIA_PUBLIC_URL}/${key}`
}

/** Public URL of one manifest for a stored video. */
export function hlsUrl(privateKey: string, manifest: string = HLS_MANIFESTS[1]): string {
  return mediaPublicUrl(deriveHlsPrefix(privateKey) + manifest)
}

/** Public URL of a photo as it will be served once ready. Says nothing about whether it is ready. */
export function photoUrl(storageKey: string): string {
  return mediaPublicUrl(photoPublicKey(storageKey))
}

export function photoShareUrl(storageKey: string): string {
  return mediaPublicUrl(photoShareKey(storageKey))
}

const PHOTO_CONTENT_TYPES: Record<PhotoSourceExtension, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
}

/** Lower-cased extension of an uploaded file if the worker can decode it, otherwise null. */
export function photoSourceExtension(fileName: string): PhotoSourceExtension | null {
  const dot = fileName.lastIndexOf('.')
  if (dot === -1) return null
  const ext = fileName.slice(dot + 1).toLowerCase()
  return (PHOTO_SOURCE_EXTENSIONS as readonly string[]).includes(ext) ? (ext as PhotoSourceExtension) : null
}

/**
 * Derived from the extension, not the browser's `file.type`: Chrome on Windows reports an empty type for a HEIC file,
 * and the type is signed into the upload URL, so both sides have to agree on exactly one value.
 */
export function photoContentType(ext: PhotoSourceExtension): string {
  return PHOTO_CONTENT_TYPES[ext]
}

/**
 * A media row with its HLS manifest already resolved on the server.
 *
 * Which manifest exists depends on when the worker processed the video, and only the server can check. Resolving it
 * once server-side keeps the client from guessing — and from silently showing nothing when it guesses wrong.
 */
export type MediaWithHls = Media & { hlsUrl?: string }

/**
 * Index of the lowest-bitrate rendition in an hls.js `levels` array.
 *
 * Not index 0: the worker's manifest lists renditions highest-bitrate first (confirmed by reading a real master.m3u8,
 * not assumed), so the lowest rung is whichever entry actually has the smallest `bitrate` — picking by position would
 * start these silent, looping previews at 1080p, the opposite of the point.
 */
export function lowestBitrateLevel(levels: { bitrate: number }[]): number {
  return levels.reduce((min, level, i, all) => (level.bitrate < all[min].bitrate ? i : min), 0)
}
