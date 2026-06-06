export const MINIO_PUBLIC_URL = (process.env.NEXT_PUBLIC_MINIO_PUBLIC_URL ?? '').replace(/\/$/, '')

export function minioPublicUrl(key: string): string {
  return `${MINIO_PUBLIC_URL}/${key}`
}

export function deriveHlsPrefix(privateKey: string): string {
  // private/route-videos/{routeId}/{uuid}.ext → public/route-videos/{routeId}/{uuid}/
  return privateKey.replace(/^private\//, 'public/').replace(/\.[^.]+$/, '') + '/'
}

export function minioHlsUrl(privateKey: string): string {
  // private/route-videos/{routeId}/{uuid}.ext → public/route-videos/{routeId}/{uuid}/playlist.m3u8
  return minioPublicUrl(deriveHlsPrefix(privateKey) + 'playlist.m3u8')
}
