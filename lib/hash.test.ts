import { describe, it, expect } from 'vitest'
import { sha256Hex } from './hash'

describe('sha256Hex', () => {
  it('matches the known SHA-256 digest of "hello"', () => {
    expect(sha256Hex(Buffer.from('hello'))).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    )
  })

  it('is deterministic for the same input', () => {
    const buf = Buffer.from('lelettrica')
    expect(sha256Hex(buf)).toBe(sha256Hex(buf))
  })

  it('differs for different input', () => {
    expect(sha256Hex(Buffer.from('a'))).not.toBe(sha256Hex(Buffer.from('b')))
  })
})
