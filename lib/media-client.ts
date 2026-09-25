import type { Media } from './db'

/**
 * Media URL helpers safe to import from client components.
 *
 * Everything here is a pure string transform over the public bucket URL, so it
 * carries no credentials and no AWS SDK. The server-side counterparts — the
 * ones that actually talk to R2 — live in `./r2`.
 *
 * Videos moved from MinIO to R2 on 2026-09-10, which is why photos, GPX files
 * and HLS streams now share one bucket and one public origin.
 */

export const MEDIA_PUBLIC_URL = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? '').replace(/\/$/, '')

export function mediaPublicUrl(key: string): string {
  return `${MEDIA_PUBLIC_URL}/${key}`
}

export function deriveHlsPrefix(privateKey: string): string {
  // private/route-videos/{routeId}/{uuid}.ext → public/route-videos/{routeId}/{uuid}/
  return privateKey.replace(/^private\//, 'public/').replace(/\.[^.]+$/, '') + '/'
}

/**
 * Manifest names the worker may have produced, most capable first.
 *
 * The transcoding worker (lelettricaleoni/videoStream-bucketWorker) originally
 * emitted a single rendition as `playlist.m3u8` in the prefix root. Since its
 * commit 55cc594 (2026-06-10) it emits adaptive bitrate: `master.m3u8` in the
 * root plus `1080p|720p|480p/playlist.m3u8` beneath it. Videos transcoded
 * before that change still only have the flat playlist, so both have to be
 * accepted — checking for the old name alone would make every new upload look
 * like it was still processing, forever and without an error anywhere.
 */
export const HLS_MANIFESTS = ['master.m3u8', 'playlist.m3u8'] as const

/** Public URL of one manifest for a stored video. */
export function hlsUrl(privateKey: string, manifest: string = HLS_MANIFESTS[1]): string {
  return mediaPublicUrl(deriveHlsPrefix(privateKey) + manifest)
}

/**
 * Photos are uploaded to a staging prefix and the worker
 * (lelettricaleoni/videoStream-bucketWorker, imaging.py) turns each one into an
 * AVIF master under the matching `public/` key. **The key mapping and the
 * extension list below are a contract with that file**: change one side and you
 * must change the other; both test suites pin the same pairs.
 *
 * A photo uploaded before the worker handled photos sits directly at its public
 * key. It is recognised by *not* being staged, and served exactly as before —
 * no data migration, and nothing to backfill.
 */
export const PHOTO_STAGING_PREFIXES = ['private/route-photos/', 'private/bike-model-photos/'] as const

/** Formats the worker can decode; anything else would sit in staging forever. */
export const PHOTO_SOURCE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'tif', 'tiff', 'heic', 'heif'] as const

export type PhotoSourceExtension = (typeof PHOTO_SOURCE_EXTENSIONS)[number]

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

export function isStagedPhotoKey(storageKey: string): boolean {
  return PHOTO_STAGING_PREFIXES.some((prefix) => storageKey.startsWith(prefix))
}

/** private/route-photos/{owner}/{uuid}.jpg → public/route-photos/{owner}/{uuid}.avif; any other key is already public. */
export function photoPublicKey(storageKey: string): string {
  if (!isStagedPhotoKey(storageKey)) return storageKey
  const dot = storageKey.lastIndexOf('.')
  const stem = dot > storageKey.lastIndexOf('/') ? storageKey.slice(0, dot) : storageKey
  return 'public/' + stem.slice('private/'.length) + '.avif'
}

/** Public URL of a photo as it will be served once ready. Says nothing about whether it is ready. */
export function photoUrl(storageKey: string): string {
  return mediaPublicUrl(photoPublicKey(storageKey))
}

/**
 * The small JPEG the worker writes beside a staged photo's master, for link
 * previews only: WhatsApp, Facebook and LinkedIn do not read AVIF. A photo that
 * predates the worker is already a JPEG, PNG or WebP and stands in for itself.
 */
export function photoShareKey(storageKey: string): string {
  const key = photoPublicKey(storageKey)
  return isStagedPhotoKey(storageKey) ? key.replace(/\.avif$/, '.share.jpg') : key
}

export function photoShareUrl(storageKey: string): string {
  return mediaPublicUrl(photoShareKey(storageKey))
}

/**
 * The photo to hand to `next/image` for anything smaller than full screen: cards,
 * the gallery frames, the admin thumbnails.
 *
 * Not the AVIF master. Vercel's image optimizer returns an AVIF source untouched —
 * the same 2400 px and the same bytes whatever width is asked for, checked on a
 * preview with AVIF added to the output formats too — so a 340 px card downloaded
 * 310 KB and the browser shrank it seven times in one step, which leaves jagged
 * edges on thin lines like spokes. The 1200 px JPEG the worker writes beside every
 * master is a source the optimizer does resize, so it goes through it properly.
 * The master stays for the full-screen viewer, where its full size is the point.
 *
 * The JPEG has no transparency (the worker flattens it onto white), which is right
 * where it is used: the cards and frames are white. The worker uploads it before
 * the master, so wherever the master exists the JPEG does.
 */
export const photoWebUrl = photoShareUrl

/** Lower-cased extension of an uploaded file if the worker can decode it, otherwise null. */
export function photoSourceExtension(fileName: string): PhotoSourceExtension | null {
  const dot = fileName.lastIndexOf('.')
  if (dot === -1) return null
  const ext = fileName.slice(dot + 1).toLowerCase()
  return (PHOTO_SOURCE_EXTENSIONS as readonly string[]).includes(ext) ? (ext as PhotoSourceExtension) : null
}

/**
 * Derived from the extension, not the browser's `file.type`: Chrome on Windows
 * reports an empty type for a HEIC file, and the type is signed into the upload
 * URL, so both sides have to agree on exactly one value.
 */
export function photoContentType(ext: PhotoSourceExtension): string {
  return PHOTO_CONTENT_TYPES[ext]
}

/**
 * A media row with its HLS manifest already resolved on the server.
 *
 * Which manifest exists depends on when the worker processed the video, and
 * only the server can check. Resolving it once server-side keeps the client
 * from guessing — and from silently showing nothing when it guesses wrong.
 */
export type MediaWithHls = Media & { hlsUrl?: string }

/**
 * Index of the lowest-bitrate rendition in an hls.js `levels` array.
 *
 * Not index 0: the worker's manifest lists renditions highest-bitrate
 * first (confirmed by reading a real master.m3u8, not assumed), so the
 * lowest rung is whichever entry actually has the smallest `bitrate` —
 * picking by position would start these silent, looping previews at
 * 1080p, the opposite of the point.
 */
export function lowestBitrateLevel(levels: { bitrate: number }[]): number {
  return levels.reduce((min, level, i, all) => (level.bitrate < all[min].bitrate ? i : min), 0)
}
