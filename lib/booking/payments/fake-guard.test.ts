import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
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

/** Every way a source file can reach the fake: a static import, a relative one, a dynamic import(), a require(). */
const REACHES_THE_FAKE =
  /from\s+['"][^'"]*payments\/fake['"]|from\s+['"]\.\/fake['"]|import\(\s*['"][^'"]*\/fake['"]\s*\)|require\(\s*['"][^'"]*\/fake['"]\s*\)/

describe('the fake payment gateway', () => {
  const files = ROOTS.flatMap((root) => sourceFiles(root))
  const factory = join(PAYMENTS, 'index.ts')

  it('finds the sources to look at', () => {
    expect(files.length).toBeGreaterThan(100)
    expect(files.some((file) => file.endsWith(factory))).toBe(true)
  })

  it('recognises every way of importing it', () => {
    for (const line of [
      "import { FakeGateway } from '@/lib/booking/payments/fake'",
      "import { FakeGateway } from './payments/fake'",
      "import { FakeGateway } from '../payments/fake'",
      "import { FakeGateway } from './fake'",
      "const { FakeGateway } = await import('./fake')",
      "const { FakeGateway } = require('../booking/payments/fake')",
    ]) expect(line, line).toMatch(REACHES_THE_FAKE)
    expect("import { getPaymentGateway } from '@/lib/booking/payments'").not.toMatch(REACHES_THE_FAKE)
  })

  it('is imported by nobody but the factory, wherever the file is', () => {
    const offenders = files.filter((file) => !file.endsWith(factory)).filter((file) => REACHES_THE_FAKE.test(readFileSync(file, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('is not re-exported by the factory: it is reached by asking the factory, never by name', () => {
    expect(readFileSync(factory, 'utf8')).not.toMatch(/export\s*\{[^}]*FakeGateway[^}]*\}\s*from/)
  })
})
