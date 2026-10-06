import { defineConfig, devices } from '@playwright/test'

/**
 * Browser tests, run against a real running copy of the site rather than the unit-test environment.
 *
 * In CI the job builds the site image, starts it with the development services behind it and points BASE_URL at
 * localhost (see .github/workflows/browser.yml), so nothing here needs fake services.
 *
 * BASE_URL decides the target: localhost in CI, and anything you like when chasing something by hand —
 * localhost:3000, staging, or production.
 */

const baseURL = process.env.BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: './tests/browser',
  // These talk to a running site over HTTP: one flaky retry is worth more
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
