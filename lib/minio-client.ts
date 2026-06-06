export const MINIO_PUBLIC_URL = (process.env.NEXT_PUBLIC_MINIO_PUBLIC_URL ?? '').replace(/\/$/, '')

export function minioPublicUrl(key: string): string {
  return `${MINIO_PUBLIC_URL}/${key}`
}

export function deriveHlsPrefix(privateKey: string): string {
  return privateKey.replace(/^private\//, 'public/').replace(/\.[^.]+$/, '') + '/'
}

export function minioHlsUrl(privateKey: string): string {
  return minioPublicUrl(deriveHlsPrefix(privateKey) + 'index.m3u8')
}
