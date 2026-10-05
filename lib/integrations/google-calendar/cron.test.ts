import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/integrations/google-calendar/sync', () => ({ syncNow: vi.fn() }))

import { syncNow } from '@/lib/integrations/google-calendar/sync'
import { runDailyCheck } from './cron'

beforeEach(() => { vi.resetAllMocks() })

describe('the daily Google Calendar check', () => {
  it('refuses a request without the secret Vercel sends, and does nothing', async () => {
    expect(await runDailyCheck(null, 'the-secret')).toEqual({ status: 401, body: { error: 'Unauthorized' } })
    expect(await runDailyCheck('Bearer wrong', 'the-secret')).toEqual({ status: 401, body: { error: 'Unauthorized' } })
    expect(syncNow).not.toHaveBeenCalled()
  })

  it('refuses everything when no secret is configured, instead of letting anyone in', async () => {
    expect(await runDailyCheck('Bearer ', undefined)).toMatchObject({ status: 401 })
    expect(await runDailyCheck('Bearer undefined', undefined)).toMatchObject({ status: 401 })
    expect(await runDailyCheck(null, '')).toMatchObject({ status: 401 })
    expect(syncNow).not.toHaveBeenCalled()
  })

  it('runs the check for the right secret and says how it went, with numbers only', async () => {
    vi.mocked(syncNow).mockResolvedValue({ status: 'done', report: { upserted: 3, removed: 1, failed: 0, firstError: null } })
    const result = await runDailyCheck('Bearer the-secret', 'the-secret')
    expect(result).toEqual({ status: 200, body: { status: 'done', upserted: 3, removed: 1, failed: 0 } })
  })

  it('says it is off when the integration is off, and is still a success', async () => {
    vi.mocked(syncNow).mockResolvedValue({ status: 'off' })
    expect(await runDailyCheck('Bearer the-secret', 'the-secret')).toEqual({ status: 200, body: { status: 'off' } })
  })

  it('never lets an error escape, and does not repeat it', async () => {
    vi.mocked(syncNow).mockRejectedValue(new Error('secret-detail'))
    const result = await runDailyCheck('Bearer the-secret', 'the-secret')
    expect(result).toEqual({ status: 500, body: { error: 'The check failed' } })
  })
})
