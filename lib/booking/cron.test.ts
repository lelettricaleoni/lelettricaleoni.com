import { describe, expect, it, vi } from 'vitest'
import { isCronRequest } from '@/lib/cron-auth'
import { runSettleHolds } from './cron'

describe('who may call a cron route', () => {
  it('lets in only the shared secret, as a bearer token', () => {
    expect(isCronRequest('Bearer s3cret', 's3cret')).toBe(true)
    expect(isCronRequest('Bearer wrong!', 's3cret')).toBe(false)
    expect(isCronRequest('s3cret', 's3cret')).toBe(false)
    expect(isCronRequest(null, 's3cret')).toBe(false)
  })

  it('lets in nobody when no secret is configured, not even an empty one', () => {
    expect(isCronRequest('Bearer ', undefined)).toBe(false)
    expect(isCronRequest('Bearer ', '')).toBe(false)
    expect(isCronRequest(null, undefined)).toBe(false)
  })
})

describe('the minute job that ends the payments nobody finished', () => {
  const ok = { settled: 2, failed: 0, orphansFreed: 1 }

  it('refuses a call without the secret, and does nothing', async () => {
    const settle = vi.fn()
    expect(await runSettleHolds('Bearer nope', 's3cret', settle)).toEqual({ status: 401, body: { error: 'Unauthorized' } })
    expect(settle).not.toHaveBeenCalled()
  })

  it('settles what is overdue and says how many', async () => {
    const settle = vi.fn().mockResolvedValue(ok)
    expect(await runSettleHolds('Bearer s3cret', 's3cret', settle)).toEqual({ status: 200, body: { status: 'done', ...ok } })
    expect(settle).toHaveBeenCalledOnce()
  })

  it('says it is off where there is no way to pay (production, until Stripe), and fails nothing', async () => {
    const { PaymentsNotConfiguredError } = await import('./payments')
    const settle = vi.fn().mockRejectedValue(new PaymentsNotConfiguredError())
    expect(await runSettleHolds('Bearer s3cret', 's3cret', settle)).toEqual({ status: 200, body: { status: 'off' } })
  })

  it('answers 500 without leaking what went wrong, so the timer shows a failure', async () => {
    const settle = vi.fn().mockRejectedValue(new Error('connection string postgres://user:pw@host'))
    const result = await runSettleHolds('Bearer s3cret', 's3cret', settle)
    expect(result).toEqual({ status: 500, body: { error: 'Settling the holds failed' } })
  })

  it('reports it as failed when some of the holds could not be settled', async () => {
    const settle = vi.fn().mockResolvedValue({ settled: 1, failed: 2, orphansFreed: 0 })
    const result = await runSettleHolds('Bearer s3cret', 's3cret', settle)
    expect(result.status).toBe(500)
    expect(result.body).toMatchObject({ status: 'partial', settled: 1, failed: 2 })
  })
})
