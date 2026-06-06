import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

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
export const MINIO_PUBLIC_URL = (process.env.NEXT_PUBLIC_MINIO_PUBLIC_URL ?? '').replace(/\/$/, '')

export function minioPublicUrl(key: string): string {
  return `${MINIO_PUBLIC_URL}/${key}`
}

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
