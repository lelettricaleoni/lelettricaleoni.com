// worker/health.ts
import { homedir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

/**
 * Where the heartbeat file lives: the home folder of the user running the worker, not /tmp, where any other user could
 * plant or replace it. Docker's health check (Dockerfile.worker) looks at the same path.
 */
export function healthFilePath(env: Record<string, string | undefined> = process.env): string {
  return env.HEALTH_FILE ?? join(homedir(), 'healthy')
}

/**
 * A heartbeat as a file: while Redis answers, the file's modification time is renewed. Docker's health check reads it
 * (a file older than a minute means unhealthy), so the worker needs no open port to be checked.
 */
export async function runHealthBeat({
  ping,
  write,
  intervalMs,
  signal,
}: {
  ping: () => Promise<boolean>
  write: () => Promise<void>
  intervalMs: number
  signal: AbortSignal
}): Promise<void> {
  while (!signal.aborted) {
    try {
      if (await ping()) await write()
    } catch {
      // Not writing is the signal: the file goes stale and Docker says unhealthy.
    }
    try {
      await sleep(intervalMs, undefined, { signal })
    } catch {
      return
    }
  }
}
