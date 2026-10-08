import { readdirSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The fake gateway "pays" without money. It must be reachable only through getPaymentGateway(), which refuses to give it in
 * production: a file that imports it directly could take bookings for free there (Kevin, 2026-10-07: never publish without Stripe).
 */
const ROOTS = ['app', 'components', 'lib', 'worker', 'scripts']
const PAYMENTS = join('lib', 'booking', 'payments')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(path)
    return /\.(ts|tsx|mjs)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : []
  })
}

describe('the fake payment gateway', () => {
  const files = ROOTS.flatMap((root) => sourceFiles(root))

  it('finds the sources to look at', () => {
    expect(files.length).toBeGreaterThan(100)
    expect(files.some((file) => file.endsWith(`${sep}index.ts`) && file.includes(PAYMENTS))).toBe(true)
  })

  it('is imported by nobody outside the payments folder', () => {
    const offenders = files.filter((file) => !file.includes(PAYMENTS) && /booking\/payments\/fake/.test(readFileSync(file, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('is imported, inside the payments folder, only by index.ts', () => {
    const offenders = files
      .filter((file) => file.includes(PAYMENTS) && !file.endsWith(`${sep}index.ts`))
      .filter((file) => /from ['"]\.\/fake['"]/.test(readFileSync(file, 'utf8')))
    expect(offenders).toEqual([])
  })
})
