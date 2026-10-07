import { describe, it, expect } from 'vitest'
import { safeErrorSummary } from './safe-error'

/**
 * What goes into a log about a failed query must not contain the person's data: Drizzle's message carries every
 * parameter of the statement.
 */
const drizzleError = (cause?: unknown) => {
  const error = new Error('Failed query: insert into "customers" ("email", "phone") values ($1, $2)\nparams: mario.rossi@example.test,+393331234567')
  if (cause) (error as { cause?: unknown }).cause = cause
  return error
}

describe('safeErrorSummary', () => {
  it("keeps what Postgres said (the code and the constraint) and drops the statement and its parameters", () => {
    const summary = safeErrorSummary(drizzleError({
      code: '23505',
      message: 'duplicate key value violates unique constraint "customers_email_unique"',
      table_name: 'customers',
      constraint_name: 'customers_email_unique',
    }))
    expect(summary).toContain('23505')
    expect(summary).toContain('customers_email_unique')
    expect(summary).not.toContain('mario.rossi@example.test')
    expect(summary).not.toContain('+393331234567')
    expect(summary).not.toContain('params')
  })

  it('says only that a query failed when there is nothing of Postgres to keep', () => {
    const summary = safeErrorSummary(drizzleError())
    expect(summary).toMatch(/query failed/)
    expect(summary).not.toContain('mario.rossi@example.test')
  })

  it('finds the error of Postgres a few levels down', () => {
    const wrapped = new Error('outer', { cause: drizzleError({ code: '23514', message: 'new row violates check constraint "customers_language_check"' }) })
    expect(safeErrorSummary(wrapped)).toContain('23514')
  })

  it('shortens any other error to one line, and never throws on odd values', () => {
    expect(safeErrorSummary(new Error('boom\nsecond line'))).toBe('Error: boom second line')
    expect(safeErrorSummary('plain text')).toBe('plain text')
    expect(safeErrorSummary(undefined)).toBe('undefined')
    expect(safeErrorSummary(null)).toBe('null')
    expect(safeErrorSummary(new Error('x'.repeat(1000))).length).toBeLessThanOrEqual(300)
  })
})
