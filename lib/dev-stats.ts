import { Redis } from '@upstash/redis'
import { sql } from 'drizzle-orm'
import { db, routes, media, routeTranslations } from '@/lib/db'
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
  if (!result) {
    console.error('[dev-stats] getRedisStats: query timed out or failed')
    return null
  }

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
  // One round trip, one connection acquisition — five separate queries here
  // used to mean five, all competing with the site's own traffic for the
  // three connections max: 3 allows (lib/db/index.ts), which is exactly the
  // kind of pool contention that hung /routes for five minutes on
  // 2026-09-15 (see STATE.md). This page must not add to that risk.
  //
  // `::int` on every value, not `round()` left as numeric: postgres.js
  // returns NUMERIC/DECIMAL columns as strings to avoid float precision
  // loss, which would have made databaseSizeMb a string silently accepted
  // by the ?? 0 fallback instead of a number.
  const rows = await settle(
    db.execute<{
      size_mb: number
      connections: number
      route_count: number
      photo_count: number
      translation_count: number
    }>(sql`
      select
        round(pg_database_size(current_database()) / 1024.0 / 1024.0)::int as size_mb,
        (select count(*)::int from pg_stat_activity where datname = current_database()) as connections,
        (select count(*)::int from ${routes}) as route_count,
        (select count(*)::int from ${media} where ${media.routeId} is not null) as photo_count,
        (select count(*)::int from ${routeTranslations}) as translation_count
    `),
    TIMEOUT_MS
  )
  const row = rows?.[0]
  if (!row) {
    console.error('[dev-stats] getPostgresStats: query timed out or failed')
    return null
  }

  return {
    databaseSizeMb: row.size_mb,
    connections: row.connections,
    routeCount: row.route_count,
    photoCount: row.photo_count,
    translationCount: row.translation_count,
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
  if (!isRecord(response)) {
    console.error('[dev-stats] getR2Stats: query timed out or failed')
    return null
  }

  // Cloudflare's response, treated as foreign input rather than trusted shape.
  const groups = (response as {
    data?: { viewer?: { accounts?: { r2StorageAdaptiveGroups?: unknown[] }[] } }
  }).data?.viewer?.accounts?.[0]?.r2StorageAdaptiveGroups
  const latest = Array.isArray(groups) ? groups[0] : undefined
  if (!isRecord(latest) || !isRecord(latest.max)) {
    console.error('[dev-stats] getR2Stats: unexpected response shape', JSON.stringify(response).slice(0, 500))
    return null
  }

  const { payloadSize, objectCount } = latest.max
  if (typeof payloadSize !== 'number' || typeof objectCount !== 'number') return null

  return { bucketName, objectCount, sizeMb: Math.round(payloadSize / 1024 / 1024) }
}
