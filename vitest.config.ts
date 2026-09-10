import { defineConfig } from 'vitest/config'

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
  test: {
    include: ['lib/**/*.test.ts', 'lib/**/*.test.tsx', 'components/**/*.test.tsx'],
    exclude: ['node_modules', '.next', 'tests/browser/**'],
  },
})
