import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { deriveHlsPrefix, minioHlsUrl, HLS_MANIFESTS } from './minio-client'

export { minioPublicUrl, deriveHlsPrefix, minioHlsUrl, HLS_MANIFESTS } from './minio-client'

export const minioClient = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT!,
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY_ID!,
    secretAccessKey: process.env.MINIO_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
  requestChecksumCalculation: 'WHEN_REQUIRED' as const,
  responseChecksumValidation: 'WHEN_REQUIRED' as const,
})

export const MINIO_BUCKET = process.env.MINIO_BUCKET_NAME!

export async function getVideoPresignedUploadUrl(key: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: MINIO_BUCKET,
    Key: key,
    ContentType: contentType,
  })
  return getSignedUrl(minioClient, command, { expiresIn: 3600 })
}

export async function deleteMinioObject(key: string): Promise<void> {
  await minioClient.send(new DeleteObjectCommand({ Bucket: MINIO_BUCKET, Key: key }))
}

export async function minioObjectExists(key: string): Promise<boolean> {
  try {
    await minioClient.send(new HeadObjectCommand({ Bucket: MINIO_BUCKET, Key: key }))
    return true
  } catch {
    return false
  }
}

export async function deleteMinioPrefix(prefix: string): Promise<void> {
  let token: string | undefined
  do {
    const res = await minioClient.send(new ListObjectsV2Command({
      Bucket: MINIO_BUCKET,
      Prefix: prefix,
      ContinuationToken: token,
    }))
    const keys = (res.Contents ?? []).map((c) => c.Key!).filter(Boolean)
    await Promise.all(keys.map((key) =>
      minioClient.send(new DeleteObjectCommand({ Bucket: MINIO_BUCKET, Key: key }))
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
 */
export async function resolveHlsUrl(storageKey: string): Promise<string | null> {
  const prefix = deriveHlsPrefix(storageKey)
  for (const manifest of HLS_MANIFESTS) {
    if (await minioObjectExists(prefix + manifest)) return minioHlsUrl(storageKey, manifest)
  }
  return null
}
