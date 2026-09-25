import { DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { s3, R2_BUCKET, deleteR2Object } from './r2'
import {
  deriveHlsPrefix, hlsUrl, HLS_MANIFESTS,
  isStagedPhotoKey, photoPublicKey, photoShareKey, photoUrl,
  type MediaWithHls,
} from './media-client'
import { readThrough, type CacheStore, getStore } from './cache'
import type { Media } from './db'

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

/** A ready photo's master never moves either, so its existence can be kept as long as a manifest's. */
const PHOTO_READY_TTL_S = 7 * 24 * 60 * 60

/**
 * Photos share the video window on purpose: the manufacturer TIFF that started
 * the image pipeline weighs 120 MB, which the five minutes a photo used to get
 * would not cover on a slow line.
 */
const PHOTO_UPLOAD_TTL_S = 3600

export async function getVideoPresignedUploadUrl(key: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType })
  return getSignedUrl(s3, command, { expiresIn: VIDEO_UPLOAD_TTL_S })
}

export async function getPhotoPresignedUploadUrl(key: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType })
  return getSignedUrl(s3, command, { expiresIn: PHOTO_UPLOAD_TTL_S })
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

/**
 * Public URL of a photo, or null while the worker has not finished it.
 *
 * A photo uploaded before the worker handled photos is already public, so it
 * answers at once with no lookup at all. A staged one is ready when its master
 * exists; only that fact is cached (never the URL, whose host differs per
 * environment) and, like a video's manifest, a "not yet" is never cached.
 */
export async function resolvePhotoUrl(
  storageKey: string,
  exists: (key: string) => Promise<boolean> = r2ObjectExists,
  store: CacheStore | null = getStore()
): Promise<string | null> {
  if (!isStagedPhotoKey(storageKey)) return photoUrl(storageKey)
  const ready = await readThrough<true | null>(
    `img:v1:${storageKey}`,
    async () => ((await exists(photoPublicKey(storageKey))) ? true : null),
    PHOTO_READY_TTL_S,
    store
  )
  return ready ? photoUrl(storageKey) : null
}

/**
 * The media a visitor can see: every photo and video whose file is actually
 * there, in order, with each video's manifest resolved. What is still being
 * processed is left out silently, never shown as broken.
 */
export async function resolveReadyMedia(
  items: Media[],
  resolvers: {
    hls: (key: string) => Promise<string | null>
    photo: (key: string) => Promise<string | null>
  } = { hls: resolveHlsUrl, photo: resolvePhotoUrl }
): Promise<MediaWithHls[]> {
  const resolved = await Promise.all(
    items.map(async (m): Promise<MediaWithHls | null> => {
      if (m.mediaType === 'video') {
        const hls = await resolvers.hls(m.storageKey)
        return hls ? { ...m, hlsUrl: hls } : null
      }
      return (await resolvers.photo(m.storageKey)) ? m : null
    })
  )
  return resolved.filter((m): m is MediaWithHls => m !== null)
}

/**
 * Everything a media row left on R2. A video leaves its source and its HLS
 * ladder; a staged photo leaves its source (if the worker never got to it), its
 * master and its link-preview JPEG. Deleting only `storageKey` used to be enough, and would now strand
 * every processed photo's AVIF forever.
 */
export async function deleteMediaFiles(m: Pick<Media, 'storageKey' | 'mediaType'>): Promise<void> {
  if (m.mediaType === 'video') {
    await Promise.all([deleteR2Object(m.storageKey), deleteR2Prefix(deriveHlsPrefix(m.storageKey))])
    return
  }
  await Promise.all([
    deleteR2Object(m.storageKey),
    ...(isStagedPhotoKey(m.storageKey)
      ? [deleteR2Object(photoPublicKey(m.storageKey)), deleteR2Object(photoShareKey(m.storageKey))]
      : []),
  ])
}

export { deriveHlsPrefix, hlsUrl, HLS_MANIFESTS, mediaPublicUrl } from './media-client'
export { deleteR2Object, r2PublicUrl } from './r2'
export type { MediaWithHls } from './media-client'
