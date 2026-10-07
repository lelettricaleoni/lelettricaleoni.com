import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Every value that reaches the database goes in as a bound parameter, never glued into the text of a query.
 *
 * Drizzle's builders and its `sql` tag do that by themselves: a `${value}` inside sql`...` is sent apart from the
 * statement. What breaks it is the escape hatches: `sql.raw(...)` and postgres.js's `.unsafe(...)` put a string into
 * the statement as it is, and a query written as a plain template string handed to `execute` does the same. None of
 * them is used (checked 2026-10-07); this test fails the day one appears, so that it is a decision somebody had to
 * defend and not something that slipped in.
 */
const ROOTS = ['app', 'lib', 'worker', 'components', 'scripts']
const SKIP_DIRS = new Set(['node_modules', '.next', 'migrations'])

function sourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...sourceFiles(path))
    else if (/\.(ts|tsx|mjs|cjs|js)$/.test(entry.name) && !/\.test\./.test(entry.name)) found.push(path)
  }
  return found
}

const files = ROOTS.flatMap((root) => {
  try {
    return sourceFiles(join(process.cwd(), root))
  } catch {
    return []
  }
})

const offenders = (pattern: RegExp) =>
  files.filter((file) => pattern.test(readFileSync(file, 'utf8'))).map((file) => file.replace(process.cwd(), ''))

describe('no SQL text built by hand', () => {
  it('finds the source files it is meant to check', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('never uses sql.raw', () => {
    expect(offenders(/\bsql\.raw\s*\(/)).toEqual([])
  })

  it("never uses postgres.js's unsafe", () => {
    expect(offenders(/\.unsafe\s*\(/)).toEqual([])
  })

  it('never hands a plain string, or a template string, to execute: only the sql tag', () => {
    // execute(`...`) and execute('...') take the text as it is; execute(sql`...`) binds what is inside.
    expect(offenders(/\.execute\s*\(\s*[`'"]/)).toEqual([])
  })
})
