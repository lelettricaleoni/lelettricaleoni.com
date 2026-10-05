import { defineConfig } from 'vitest/config'
import path from 'node:path'

/**
 * Tests that talk to the DEVELOPMENT database: `npm run test:db`.
 *
 * Kept out of `npm test` and out of CI on purpose: CI's checks need no services and no secrets.
 * They insert and delete rows, so tests/db/setup.ts refuses to run against production.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      // See tests/server-only-stub.ts.
      'server-only': path.resolve(__dirname, 'tests/server-only-stub.ts'),
    },
  },
  test: {
    include: ['tests/db/**/*.test.ts'],
    setupFiles: ['tests/db/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
})
