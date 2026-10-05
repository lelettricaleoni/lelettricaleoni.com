import { runDailyCheck } from '@/lib/integrations/google-calendar/cron'

// Called by Vercel's cron (see vercel.json), never by our own frontend: the one case for a route handler.
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { status, body } = await runDailyCheck(request.headers.get('authorization'), process.env.CRON_SECRET)
  return Response.json(body, { status })
}
