import { defineConfig } from 'vitest/config'
import path from 'node:path'

/**
 * Unit tests only.
 *
 * Without this, vitest picks up tests/browser/ too and fails on Playwright's
 * imports — two runners reaching for the same files. The split is by
 * directory: anything under tests/browser/ belongs to Playwright and needs a
 * deployment to talk to, everything else runs here in milliseconds with no
 * services at all.
 */
export default defineConfig({
  // Stesso alias di tsconfig.json: i componenti importano da '@/...'.
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      // See tests/server-only-stub.ts.
      'server-only': path.resolve(__dirname, 'tests/server-only-stub.ts'),
    },
  },
  test: {
    include: ['lib/**/*.test.ts', 'lib/**/*.test.tsx', 'components/**/*.test.tsx', 'worker/**/*.test.ts'],
    exclude: ['node_modules', '.next', 'tests/browser/**'],
  },
})
