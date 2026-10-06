import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('the worker package', () => {
  it('asks the image for exactly the versions the repository tested, not for a range', () => {
    execFileSync(process.execPath, ['scripts/build-worker.mjs'], { stdio: 'ignore' })
    const { dependencies } = JSON.parse(readFileSync('dist/worker/package.json', 'utf8')) as {
      dependencies: Record<string, string>
    }
    expect(Object.keys(dependencies).sort()).toEqual(['libheif-js', 'sharp'])
    for (const version of Object.values(dependencies)) expect(version).toMatch(/^\d+\.\d+\.\d+$/)
    // Exactly what `npm ci` put in node_modules, i.e. what package-lock.json says.
    for (const [name, version] of Object.entries(dependencies)) {
      expect(JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8')).version).toBe(version)
    }
  }, 60_000)
})
