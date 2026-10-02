// SQLSTATE codes this codebase reacts to.
export const EXCLUSION_VIOLATION = '23P01'
export const UNIQUE_VIOLATION = '23505'
export const FOREIGN_KEY_VIOLATION = '23503'
export const CHECK_VIOLATION = '23514'

/**
 * The Postgres error code of a failed query. Drizzle wraps the driver's error, so the code
 * is on `cause`, not on the error that is thrown.
 */
export function pgErrorCode(error: unknown): string | undefined {
  let current: unknown = error
  for (let depth = 0; depth < 5 && current !== null && typeof current === 'object'; depth++) {
    const code = (current as { code?: unknown }).code
    if (typeof code === 'string') return code
    current = (current as { cause?: unknown }).cause
  }
  return undefined
}
