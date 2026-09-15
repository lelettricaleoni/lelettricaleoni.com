import { Redis } from '@upstash/redis'
import { sql } from 'drizzle-orm'
import { db, routes, routePhotos, routeTranslations } from '@/lib/db'
import { HEARTBEAT_KEY } from '@/lib/worker-heartbeat'

/**
 * A read-only look at the services behind the site, for the dev-tools page.
 * Every function here fails to `null` rather than throwing: one service
 * being unreachable must not blank the whole page, and this is a diagnostic
 * screen, not a request path anything else depends on.
 *
 * Every external call is bounded by `settle()` — the same lesson lib/cache.ts
 * was built from: an unbounded external call on a request path once made the
 * home page 40x slower. This page found out again the hard way, hanging on a
 * Redis call with no timeout at all until the visitor gave up.
 */

/** Resolve with null instead of hanging forever. */
async function settle<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), ms) }),
    ])
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Generous compared to lib/cache.ts's 250ms: this page is visited on
 *  purpose, not on every request, so it can afford to wait a little longer
 *  for a real answer — but it must still always resolve. */
const TIMEOUT_MS = 5000

export interface RedisStats {
  totalKeys: number
  /** Video jobs with a live status entry right now, the heartbeat key aside. */
  trackedJobs: number
}

export async function getRedisStats(): Promise<RedisStats | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null

  const redis = new Redis({ url, token })
  const result = await settle(
    Promise.all([redis.dbsize(), redis.keys('videojob:v1:*')]),
    TIMEOUT_MS
  )
  if (!result) return null

  const [totalKeys, jobKeys] = result
  return {
    totalKeys,
    trackedJobs: jobKeys.filter((k) => k !== HEARTBEAT_KEY).length,
  }
}

export interface PostgresStats {
  databaseSizeMb: number
  connections: number
  routeCount: number
  photoCount: number
  translationCount: number
}

export async function getPostgresStats(): Promise<PostgresStats | null> {
  const result = await settle(
    Promise.all([
      db.execute<{ size_mb: number }>(
        sql`select round(pg_database_size(current_database()) / 1024.0 / 1024.0) as size_mb`
      ),
      db.execute<{ count: number }>(
        sql`select count(*)::int as count from pg_stat_activity where datname = current_database()`
      ),
      db.select({ count: sql<number>`count(*)::int` }).from(routes),
      db.select({ count: sql<number>`count(*)::int` }).from(routePhotos),
      db.select({ count: sql<number>`count(*)::int` }).from(routeTranslations),
    ]),
    TIMEOUT_MS
  )
  if (!result) return null

  const [[sizeRow], [connRow], [routeRow], [photoRow], [translationRow]] = result
  return {
    databaseSizeMb: sizeRow?.size_mb ?? 0,
    connections: connRow?.count ?? 0,
    routeCount: routeRow?.count ?? 0,
    photoCount: photoRow?.count ?? 0,
    translationCount: translationRow?.count ?? 0,
  }
}

export interface R2Stats {
  bucketName: string
  objectCount: number
  sizeMb: number
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/**
 * R2 has no live "how big is this bucket" endpoint — object storage never
 * does, the count is too expensive to keep current on every write. This
 * reads yesterday's number off Cloudflare's GraphQL analytics instead, the
 * same data the dashboard graphs come from, which is current within a day
 * rather than to the second.
 */
export async function getR2Stats(): Promise<R2Stats | null> {
  const token = process.env.CLOUDFLARE_API_TOKEN
  const accountId = process.env.R2_ACCOUNT_ID
  const bucketName = process.env.R2_BUCKET_NAME
  if (!token || !accountId || !bucketName) return null

  const today = new Date()
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
  const iso = (d: Date) => d.toISOString().slice(0, 10)

  const query = `query {
    viewer {
      accounts(filter: { accountTag: "${accountId}" }) {
        r2StorageAdaptiveGroups(
          limit: 1
          filter: { bucketName: "${bucketName}", date_geq: "${iso(weekAgo)}", date_leq: "${iso(today)}" }
          orderBy: [date_DESC]
        ) {
          dimensions { date }
          max { payloadSize objectCount }
        }
      }
    }
  }`

  const response = await settle(
    fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    }).then((r) => r.json()),
    TIMEOUT_MS
  )
  if (!isRecord(response)) return null

  // Cloudflare's response, treated as foreign input rather than trusted shape.
  const groups = (response as {
    data?: { viewer?: { accounts?: { r2StorageAdaptiveGroups?: unknown[] }[] } }
  }).data?.viewer?.accounts?.[0]?.r2StorageAdaptiveGroups
  const latest = Array.isArray(groups) ? groups[0] : undefined
  if (!isRecord(latest) || !isRecord(latest.max)) return null

  const { payloadSize, objectCount } = latest.max
  if (typeof payloadSize !== 'number' || typeof objectCount !== 'number') return null

  return { bucketName, objectCount, sizeMb: Math.round(payloadSize / 1024 / 1024) }
}
