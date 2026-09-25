import { describe, it, expect } from 'vitest'
import { clientOptions } from './client-options'

describe('clientOptions', () => {
  // Measured 2026-09-24 against the Supabase transaction pooler: with the
  // default pipelining, any query beyond the pool size is written onto a busy
  // connection and never comes back, and the connection stays wedged. See the
  // comment in client-options.ts. Someone tidying this file must not undo it.
  it('never pipelines a second query onto a busy connection', () => {
    expect(clientOptions.max_pipeline).toBe(0)
  })

  it('keeps the settings the transaction pooler requires', () => {
    expect(clientOptions.prepare).toBe(false)
    expect(clientOptions.max).toBe(3)
  })
})
