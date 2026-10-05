import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { checkHealth } from '@/lib/health'

// Asked by the deploy script, which will not move the traffic to a new version until this answers (with ?deep=1), and by
// the uptime monitor. Not part of our frontend: one of the cases for a route handler. It reads the request, so it is
// answered per request (a `dynamic` setting is not allowed with Cache Components, and not needed).

export async function GET(request: Request) {
  const { httpStatus, body } = await checkHealth({
    deep: new URL(request.url).searchParams.get('deep') === '1',
    version: process.env.APP_VERSION ?? 'dev',
    checkDatabase: async () => { await db.execute(sql`select 1`) },
  })
  return Response.json(body, { status: httpStatus, headers: { 'Cache-Control': 'no-store' } })
}
