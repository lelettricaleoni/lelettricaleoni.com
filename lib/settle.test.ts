// lib/settle.test.ts
import { describe, expect, it } from 'vitest'
import { settle } from './settle'

describe('settle', () => {
  it('returns what the work resolves with', async () => {
    expect(await settle(Promise.resolve(42), 100)).toBe(42)
  })

  it('returns null instead of waiting for work that is too slow', async () => {
    const never = new Promise<number>(() => {})
    expect(await settle(never, 10)).toBeNull()
  })

  it('returns null instead of throwing', async () => {
    expect(await settle(Promise.reject(new Error('down')), 100)).toBeNull()
  })
})
