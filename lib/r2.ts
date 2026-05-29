import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const R2_ENDPOINT = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`

const s3 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  requestChecksumCalculation: 'when_required',
  responseChecksumValidation: 'when_required',
})

export const R2_BUCKET = process.env.R2_BUCKET_NAME!
export const R2_PUBLIC_URL = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? '').replace(/\/$/, '')

export function r2PublicUrl(key: string): string {
  return `${R2_PUBLIC_URL}/${key}`
}

export async function getPresignedUploadUrl(key: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: contentType,
  })
  return getSignedUrl(s3, command, { expiresIn: 300 })
}

export async function deleteR2Object(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }))
}
