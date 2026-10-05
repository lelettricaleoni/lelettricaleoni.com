import { describe, expect, it, vi } from 'vitest'
import { checkHealth } from './health'

describe('checkHealth', () => {
  it('answers ok with the version when only asked whether the process is alive', async () => {
    const checkDatabase = vi.fn()
    expect(await checkHealth({ checkDatabase, version: 'abc123', deep: false })).toEqual({ httpStatus: 200, body: { status: 'ok', version: 'abc123' } })
    expect(checkDatabase).not.toHaveBeenCalled()
  })

  it('also checks the database when asked to look deeper', async () => {
    const checkDatabase = vi.fn().mockResolvedValue(undefined)
    expect(await checkHealth({ checkDatabase, version: 'abc123', deep: true })).toEqual({
      httpStatus: 200, body: { status: 'ok', version: 'abc123', checks: { database: 'ok' } },
    })
  })

  it('says 503 when the database does not answer, and says nothing about why', async () => {
    const checkDatabase = vi.fn().mockRejectedValue(new Error('password authentication failed for user postgres'))
    const result = await checkHealth({ checkDatabase, version: 'abc123', deep: true })
    expect(result).toEqual({ httpStatus: 503, body: { status: 'down', version: 'abc123', checks: { database: 'failed' } } })
    expect(JSON.stringify(result)).not.toContain('password')
  })

  it('says 503 when the database takes too long, instead of waiting for ever', async () => {
    const checkDatabase = () => new Promise<void>(() => {})  // never answers
    const result = await checkHealth({ checkDatabase, version: 'v', deep: true, timeoutMs: 30 })
    expect(result.httpStatus).toBe(503)
    expect(result.body.checks).toEqual({ database: 'failed' })
  })
})
