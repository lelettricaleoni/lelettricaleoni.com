import { describe, it, expect } from 'vitest'
import { pgErrorCode, EXCLUSION_VIOLATION } from './pg-errors'

describe('pgErrorCode', () => {
  it('reads the code of a driver error', () => {
    expect(pgErrorCode({ code: '23P01' })).toBe(EXCLUSION_VIOLATION)
  })

  it('finds the code under `cause`, where Drizzle wraps the driver error', () => {
    expect(pgErrorCode(Object.assign(new Error('Failed query'), { cause: { code: '23505' } }))).toBe('23505')
  })

  it('follows a chain of causes', () => {
    expect(pgErrorCode({ cause: { cause: { code: '23503' } } })).toBe('23503')
  })

  it('returns undefined when there is no code', () => {
    expect(pgErrorCode(new Error('boom'))).toBeUndefined()
    expect(pgErrorCode(null)).toBeUndefined()
    expect(pgErrorCode('text')).toBeUndefined()
  })
})
