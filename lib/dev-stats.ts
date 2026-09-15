import { Redis } from '@upstash/redis'
import { sql } from 'drizzle-orm'
import { db, routes, routePhotos, routeTranslations } from '@/lib/db'
import { HEARTBEAT_KEY } from '@/lib/worker-heartbeat'

/**
 * A read-only look at the services behind the site, for the dev-tools page.
 * Every function here fails to `null` rather than throwing: one service
 * being unreachable must not blank the whole page, and this is a diagnostic
 * screen, not a request path anything else depends on.
 */

export interface RedisStats {
  totalKeys: number
  /** Video jobs with a live status entry right now, the heartbeat key aside. */
  trackedJobs: number
}

export async function getRedisStats(): Promise<RedisStats | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null

  try {
    const redis = new Redis({ url, token })
    const [totalKeys, jobKeys] = await Promise.all([
      redis.dbsize(),
      redis.keys('videojob:v1:*'),
    ])
    return {
      totalKeys,
      trackedJobs: jobKeys.filter((k) => k !== HEARTBEAT_KEY).length,
    }
  } catch {
    return null
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
  try {
    const [[sizeRow], [connRow], [routeRow], [photoRow], [translationRow]] = await Promise.all([
      db.execute<{ size_mb: number }>(
        sql`select round(pg_database_size(current_database()) / 1024.0 / 1024.0) as size_mb`
      ),
      db.execute<{ count: number }>(
        sql`select count(*)::int as count from pg_stat_activity where datname = current_database()`
      ),
      db.select({ count: sql<number>`count(*)::int` }).from(routes),
      db.select({ count: sql<number>`count(*)::int` }).from(routePhotos),
      db.select({ count: sql<number>`count(*)::int` }).from(routeTranslations),
    ])
    return {
      databaseSizeMb: sizeRow?.size_mb ?? 0,
      connections: connRow?.count ?? 0,
      routeCount: routeRow?.count ?? 0,
      photoCount: photoRow?.count ?? 0,
      translationCount: translationRow?.count ?? 0,
    }
  } catch {
    return null
  }
}
