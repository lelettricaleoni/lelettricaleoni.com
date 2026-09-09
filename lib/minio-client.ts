import type { RoutePhoto } from './db'

export const MINIO_PUBLIC_URL = (process.env.NEXT_PUBLIC_MINIO_PUBLIC_URL ?? '').replace(/\/$/, '')

export function minioPublicUrl(key: string): string {
  return `${MINIO_PUBLIC_URL}/${key}`
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
export function minioHlsUrl(privateKey: string, manifest: string = HLS_MANIFESTS[1]): string {
  return minioPublicUrl(deriveHlsPrefix(privateKey) + manifest)
}

/**
 * A media row with its HLS manifest already resolved on the server.
 *
 * Which manifest exists depends on when the worker processed the video, and
 * only the server can check. Resolving it once server-side keeps the client
 * from guessing — and from silently showing nothing when it guesses wrong.
 */
export type MediaWithHls = RoutePhoto & { hlsUrl?: string }
