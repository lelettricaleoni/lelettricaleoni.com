export interface HealthResponse {
  httpStatus: number
  body: { status: 'ok' | 'down'; version: string; checks?: { database: 'ok' | 'failed' } }
}

const DEFAULT_TIMEOUT_MS = 2_000

/**
 * What the deploy and the uptime monitor ask. `deep: false` says only that the process is alive and which version it is
 * (cheap, for a quick poll). `deep: true` also asks the database a trivial question, which is what a new version must
 * answer before the traffic is moved to it. Never says why something failed: this answers anyone who asks.
 */
export async function checkHealth({
  checkDatabase, version, deep, timeoutMs = DEFAULT_TIMEOUT_MS,
}: { checkDatabase: () => Promise<void>; version: string; deep: boolean; timeoutMs?: number }): Promise<HealthResponse> {
  if (!deep) return { httpStatus: 200, body: { status: 'ok', version } }

  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      checkDatabase(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeoutMs) }),
    ])
    return { httpStatus: 200, body: { status: 'ok', version, checks: { database: 'ok' } } }
  } catch {
    return { httpStatus: 503, body: { status: 'down', version, checks: { database: 'failed' } } }
  } finally {
    clearTimeout(timer)
  }
}
