/*
 * Copies the media files of the PRODUCTION catalogue into the DEVELOPMENT bucket, so that a test site with a copy of the production data shows
 * the same photos, videos and tracks. The files are READ from the public address of the production bucket (nothing there is written, and no
 * production key is needed) and WRITTEN with the development keys of .env.local, into the development bucket only.
 *
 * Which files: for every row of `media` of the development database (already a copy of production: docs/superpowers/plans/2026-10-13-production-data-to-test.md (the database is copied first, by hand, through the read-only access to production))
 * the photo's master, link preview and renditions (or the old photo as it is), the video's HLS stream (manifests, playlists and segments, found by
 * reading the playlists), and the GPX of every route.
 *
 *   node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/copy-prod-media-to-test.mts [--dry]
 */
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import postgres from 'postgres'
import { deriveHlsPrefix, HLS_MANIFESTS, isStagedPhotoKey, photoPublicKey, photoRenditionKeys, photoShareKey } from '../lib/media/keys'

const PRODUCTION_BUCKET = 'lelettrica-trails'
const PRODUCTION_PUBLIC_URL = 'https://trails-bucket.lelettricaleoni.com'
const dry = process.argv.includes('--dry')

const databaseUrl = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL
const bucket = process.env.R2_BUCKET_NAME
if (!databaseUrl || !bucket || !process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) throw new Error('missing development variables')
if (databaseUrl.includes('hhfnhzdourgkinwlqvtc')) throw new Error('this is the production database: refusing')
if (bucket === PRODUCTION_BUCKET) throw new Error('this is the production bucket: refusing')

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
})
const sql = postgres(databaseUrl, { max: 1 })

const keys = new Set<string>()
const media = await sql<{ storage_key: string; media_type: string }[]>`select storage_key, media_type from media`
for (const row of media) {
  if (row.media_type === 'video') {
    for (const manifest of HLS_MANIFESTS) keys.add(deriveHlsPrefix(row.storage_key) + manifest)
  } else {
    keys.add(photoPublicKey(row.storage_key))
    if (isStagedPhotoKey(row.storage_key)) {
      keys.add(photoShareKey(row.storage_key))
      for (const key of photoRenditionKeys(row.storage_key)) keys.add(key)
    }
  }
}
for (const row of await sql<{ gpx_key: string | null }[]>`select gpx_key from routes`) if (row.gpx_key) keys.add(row.gpx_key)
await sql.end()

async function fetchProduction(key: string): Promise<{ body: Buffer; contentType: string; cacheControl?: string } | null> {
  const response = await fetch(`${PRODUCTION_PUBLIC_URL}/${key.split('/').map(encodeURIComponent).join('/')}`)
  if (response.status === 404 || response.status === 403) return null
  if (!response.ok) throw new Error(`${key}: HTTP ${response.status}`)
  return {
    body: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') ?? 'application/octet-stream',
    cacheControl: response.headers.get('cache-control') ?? undefined,
  }
}

async function existsInDevelopment(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return true
  } catch {
    return false
  }
}

/** The files a playlist points to (a line that is not a tag, and the URI="…" of the tags), as keys next to the playlist. */
function referencedKeys(playlistKey: string, text: string): string[] {
  const folder = playlistKey.slice(0, playlistKey.lastIndexOf('/') + 1)
  const found = new Set<string>()
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    if (trimmed.startsWith('#')) {
      const uri = /URI="([^"]+)"/.exec(trimmed)?.[1]
      if (uri) found.add(folder + uri)
    } else {
      found.add(folder + trimmed)
    }
  }
  return [...found]
}

const report = { copied: 0, alreadyThere: 0, missing: [] as string[], bytes: 0 }
const queue = [...keys]
const seen = new Set(queue)

async function copy(key: string): Promise<void> {
  if (!dry && (await existsInDevelopment(key))) {
    report.alreadyThere += 1
    // Even a stream that is there is walked, to make sure all its segments are.
    if (!key.endsWith('.m3u8')) return
  }
  const file = await fetchProduction(key)
  if (!file) {
    report.missing.push(key)
    return
  }
  report.bytes += file.body.length
  if (!dry) await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: file.body, ContentType: file.contentType, CacheControl: file.cacheControl }))
  report.copied += 1
  if (key.endsWith('.m3u8')) {
    for (const next of referencedKeys(key, file.body.toString('utf8'))) {
      if (!seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }
}

const workers = Array.from({ length: 6 }, async () => {
  for (let key = queue.shift(); key !== undefined; key = queue.shift()) await copy(key)
})
await Promise.all(workers)

console.log(JSON.stringify({
  mode: dry ? 'dry' : 'copy',
  listed: keys.size,
  filesSeen: seen.size,
  copied: report.copied,
  alreadyThere: report.alreadyThere,
  megabytes: Math.round(report.bytes / 1024 / 1024),
  missingCount: report.missing.length,
  missingSample: report.missing.slice(0, 12),
}, null, 1))
