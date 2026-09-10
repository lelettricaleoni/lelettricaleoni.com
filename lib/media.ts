import { DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { s3, R2_BUCKET } from './r2'
import { deriveHlsPrefix, hlsUrl, HLS_MANIFESTS } from './media-client'
import { readThrough } from './cache'

/**
 * Server-side media operations on R2: the ones that need credentials.
 *
 * Videos and their HLS streams lived on MinIO until 2026-09-10 and now share
 * the bucket with photos and GPX files. Keeping this out of `./r2` matters:
 * that module is imported by client components, and the Redis cache below must
 * not follow it into the browser bundle.
 */

/** A resolved manifest never moves, so it can be kept for a long time. */
const HLS_URL_TTL_S = 7 * 24 * 60 * 60

/** Videos are large, so their upload window is far longer than a photo's. */
const VIDEO_UPLOAD_TTL_S = 3600

export async function getVideoPresignedUploadUrl(key: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType })
  return getSignedUrl(s3, command, { expiresIn: VIDEO_UPLOAD_TTL_S })
}

export async function r2ObjectExists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }))
    return true
  } catch {
    return false
  }
}

export async function deleteR2Prefix(prefix: string): Promise<void> {
  let token: string | undefined
  do {
    const res = await s3.send(new ListObjectsV2Command({
      Bucket: R2_BUCKET,
      Prefix: prefix,
      ContinuationToken: token,
    }))
    const keys = (res.Contents ?? []).map((c) => c.Key!).filter(Boolean)
    await Promise.all(keys.map((key) =>
      s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }))
    ))
    token = res.NextContinuationToken
  } while (token)
}

/**
 * Public URL of a video's HLS manifest, or null when the worker has not
 * finished (or never ran).
 *
 * Doubles as the readiness check: a video with no manifest is not ready to
 * show. Tries the adaptive `master.m3u8` first and falls back to the older flat
 * `playlist.m3u8` — see HLS_MANIFESTS for why both exist.
 *
 * The cache key is versioned: `v1` holds MinIO URLs with a week still to run on
 * them, and serving those after the move would point every player at a host
 * that no longer answers.
 */
export async function resolveHlsUrl(storageKey: string): Promise<string | null> {
  return readThrough(
    `hls:v2:${storageKey}`,
    async () => {
      const prefix = deriveHlsPrefix(storageKey)
      for (const manifest of HLS_MANIFESTS) {
        if (await r2ObjectExists(prefix + manifest)) return hlsUrl(storageKey, manifest)
      }
      return null
    },
    HLS_URL_TTL_S
  )
}

export { deriveHlsPrefix, hlsUrl, HLS_MANIFESTS, mediaPublicUrl } from './media-client'
export { deleteR2Object, r2PublicUrl } from './r2'
export type { MediaWithHls } from './media-client'
