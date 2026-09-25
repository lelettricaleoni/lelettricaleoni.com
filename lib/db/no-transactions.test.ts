import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * `db.transaction` (postgres.js `begin`) cannot run on this client: with
 * `max_pipeline: 0` (see client-options.ts) the connection is never marked as
 * reserved, and BEGIN is refused with UNSAFE_TRANSACTION. Renaming and deleting
 * a route category broke in production on 2026-09-25 for exactly that reason.
 *
 * Use a single statement (a CTE is atomic on its own) — see
 * lib/route-bike-categories.ts. If a real multi-statement transaction is ever
 * needed, it needs its own client, not this one.
 */
const ROOTS = ['lib', 'app', 'components']
const SKIP_DIRS = new Set(['node_modules', '.next'])
const TRANSACTION = /\.(transaction|begin)\s*\(/

function isSource(name: string): boolean {
  const isTs = name.endsWith('.ts') || name.endsWith('.tsx')
  const isTest = name.endsWith('.test.ts') || name.endsWith('.test.tsx')
  return isTs && !isTest
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (SKIP_DIRS.has(name)) return []
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return isSource(name) ? [path] : []
  })
}

describe('database access', () => {
  it('never opens a transaction on the shared client', () => {
    const offenders = ROOTS.flatMap(sourceFiles)
      .filter((file) => TRANSACTION.test(readFileSync(file, 'utf8')))
      .map((file) => relative(process.cwd(), file))

    expect(offenders, 'db.transaction / sql.begin breaks with max_pipeline: 0').toEqual([])
  })
})
