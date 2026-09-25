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
const SKIP = /node_modules|\.next|\.test\.tsx?$/
const TRANSACTION = /\.(transaction|begin)\s*\(/

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (SKIP.test(path)) return []
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) ? [path] : []
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
