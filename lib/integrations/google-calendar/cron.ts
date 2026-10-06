import 'server-only'
import { timingSafeEqual } from 'node:crypto'
import { syncNow } from '@/lib/integrations/google-calendar/sync'

/*
 * The daily check Vercel runs (vercel.json): the same reconcile as the "Sync now" button, for the days when
 * Google did not answer at the moment of a booking. Vercel sends `Authorization: Bearer <CRON_SECRET>`.
 */

export interface CronResponse {
  status: number
  body: Record<string, unknown>
}

function sameSecret(header: string | null, secret: string | undefined): boolean {
  if (!secret) return false  // no secret configured: nobody gets in
  const given = Buffer.from(header ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

export async function runDailyCheck(authorization: string | null, secret: string | undefined): Promise<CronResponse> {
  if (!sameSecret(authorization, secret)) return { status: 401, body: { error: 'Unauthorized' } }
  try {
    const result = await syncNow()
    if (result.status === 'off') return { status: 200, body: { status: 'off' } }
    const { upserted, removed, failed } = result.report
    return { status: 200, body: { status: 'done', upserted, removed, failed } }
  } catch {
    return { status: 500, body: { error: 'The check failed' } }
  }
}
