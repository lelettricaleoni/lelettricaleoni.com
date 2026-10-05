/*
 * Which environment this copy of the site is: "production", "staging" or "development" (a laptop). It decides, for
 * example, whether Google Analytics runs. APP_ENV works wherever the site is hosted; VERCEL_ENV is read as a fallback
 * so nothing changes while the site is still on Vercel.
 */
export function appEnv(): string {
  return process.env.APP_ENV || process.env.VERCEL_ENV || 'development'
}

export function isProduction(): boolean {
  return appEnv() === 'production'
}
