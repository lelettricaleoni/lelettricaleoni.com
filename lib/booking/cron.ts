import 'server-only'
import { isCronRequest } from '@/lib/cron-auth'
import { PaymentsNotConfiguredError } from './payments'
import { settleOverdueHolds } from './settle'

export interface CronResponse {
  status: number
  body: Record<string, unknown>
}

/**
 * What runs every minute (a systemd timer on the VM, deploy/web/settle-holds@.timer): ends the payments nobody finished, so the bikes held
 * for them are free again, and confirms the ones that were paid without anybody noticing (`settleOverdueHolds`).
 * `off` where there is no way to pay (production, until Stripe is there). Any failure is a 500 so the timer shows it.
 */
export async function runSettleHolds(
  authorization: string | null, secret: string | undefined, settle: typeof settleOverdueHolds = settleOverdueHolds,
): Promise<CronResponse> {
  if (!isCronRequest(authorization, secret)) return { status: 401, body: { error: 'Unauthorized' } }
  try {
    const result = await settle()
    if (result.failed > 0) return { status: 500, body: { status: 'partial', ...result } }
    return { status: 200, body: { status: 'done', ...result } }
  } catch (error) {
    if (error instanceof PaymentsNotConfiguredError) return { status: 200, body: { status: 'off' } }
    return { status: 500, body: { error: 'Settling the holds failed' } }
  }
}
