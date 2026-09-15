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
