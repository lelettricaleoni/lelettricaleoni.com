/**
 * A line about a failure that is safe to write in a log.
 *
 * When a query fails, Drizzle throws an error whose MESSAGE is the statement and ALL its parameters
 * ("Failed query: insert into customers ... params: mario.rossi@example.com,+39333..."). Logging `String(error)` or
 * `error.message` from a query that touches a person's data would copy their email, name and phone into the server's
 * logs, which nobody can delete from and which nobody thought of when writing the privacy policy (measured 2026-10-07).
 *
 * What is safe to say is what Postgres itself said: the code and the message of ITS error ("duplicate key value violates
 * unique constraint ..." names the constraint, not the value), which Drizzle keeps in `cause`, plus the table and
 * constraint. Anything else is cut to a first line, and a Drizzle wrapper is reduced to saying so.
 */
export function safeErrorSummary(error: unknown): string {
  let current: unknown = error
  for (let depth = 0; depth < 5 && current !== null && typeof current === 'object'; depth++) {
    const e = current as { code?: unknown; message?: unknown; table_name?: unknown; constraint_name?: unknown; cause?: unknown }
    // The error of Postgres: it has a SQLSTATE code, and its message carries no values.
    if (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code) && typeof e.message === 'string') {
      const where = [
        typeof e.table_name === 'string' ? `table=${e.table_name}` : '',
        typeof e.constraint_name === 'string' ? `constraint=${e.constraint_name}` : '',
      ].filter(Boolean).join(' ')
      return oneLine(`postgres ${e.code}: ${e.message}${where ? ` (${where})` : ''}`)
    }
    current = e.cause
  }

  if (error instanceof Error) {
    if (error.message.startsWith('Failed query')) return 'a query failed (the statement and its parameters are left out of the log)'
    return oneLine(`${error.name}: ${error.message}`)
  }
  return oneLine(String(error))
}

const oneLine = (text: string): string => text.replace(/[\r\n]+/g, ' ').slice(0, 300)
