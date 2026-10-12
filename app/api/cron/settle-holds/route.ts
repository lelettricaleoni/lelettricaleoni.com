import { runSettleHolds } from '@/lib/booking/cron'

// Called by the VM's timer every minute (deploy/web/settle-holds@.timer), never by our own frontend: the one case for a route handler.
// It reads the request, so it runs per request.

export async function GET(request: Request) {
  const { status, body } = await runSettleHolds(request.headers.get('authorization'), process.env.CRON_SECRET)
  return Response.json(body, { status })
}
