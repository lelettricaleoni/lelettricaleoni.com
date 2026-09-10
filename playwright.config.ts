import { defineConfig, devices } from '@playwright/test'

/**
 * Browser tests, run against a real deployment rather than a local build.
 *
 * The preview Vercel builds for every pull request is already a true
 * environment with the real services behind it, so nothing here needs the fake
 * ones the earlier spec planned. Protected previews are reached with the
 * automation bypass token, which is what Vercel publishes it for.
 *
 * BASE_URL decides the target: a preview URL in CI, and anything you like when
 * chasing something by hand — localhost:3000, or production.
 */

const baseURL = process.env.BASE_URL ?? 'http://localhost:3000'
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET

export default defineConfig({
  testDir: './tests/browser',
  // These talk to a deployment over the network: one flaky retry is worth more
  // than a red build, but two would hide a genuine intermittent fault.
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(bypass
      ? {
          extraHTTPHeaders: {
            'x-vercel-protection-bypass': bypass,
            'x-vercel-set-bypass-cookie': 'true',
          },
        }
      : {}),
  },

  // The width is part of the test, not a detail: the card overflow that
  // reached production on 2026-09-10 was invisible at one column and obvious
  // at three.
  projects: [
    { name: 'telefono', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
    { name: 'due-colonne', use: { ...devices['Desktop Chrome'], viewport: { width: 900, height: 900 } } },
    { name: 'tre-colonne', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
})
