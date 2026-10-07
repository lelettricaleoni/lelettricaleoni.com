import { unstable_isUnrecognizedActionError } from 'next/navigation'

/**
 * A page that was opened before a deploy calls Server Actions by ids that the new
 * build no longer has. Vercel used to hide that (skew protection); on the VM nothing
 * does, and the panel answered with a generic error on the first save after any
 * deploy (2026-10-07, "Failed to find Server Action").
 *
 * The recovery is to load the new page. The guard below keeps that from becoming a
 * loop if the reload does not help (for example a genuinely broken action).
 */

export const STALE_RELOAD_KEY = 'stale-action-reload-at'
export const STALE_RELOAD_COOLDOWN_MS = 10_000

export function shouldReloadForStaleAction(lastReloadAt: number | null, now: number): boolean {
  return lastReloadAt === null || now - lastReloadAt > STALE_RELOAD_COOLDOWN_MS
}

/** Whether a reload is allowed now: it is not if the page already reloaded for this a moment ago. */
export function canReloadForStaleAction(): boolean {
  let last: number | null = null
  try {
    const stored = window.sessionStorage.getItem(STALE_RELOAD_KEY)
    last = stored ? Number(stored) : null
  } catch {
    // Storage can be blocked: then there is no memory of a reload, and one is allowed.
  }
  return shouldReloadForStaleAction(last, Date.now())
}

/**
 * Reloads the page unless it already did within the cooldown. Returns whether it
 * reloaded, so the caller can show a message when it did not.
 */
export function reloadForStaleAction(): boolean {
  if (!canReloadForStaleAction()) return false
  try {
    window.sessionStorage.setItem(STALE_RELOAD_KEY, String(Date.now()))
  } catch {
    // Same as above.
  }
  window.location.reload()
  return true
}

/**
 * For a `catch` that turns every failure into a toast: lets the "this page is from before
 * the update" error through, so the guard or the error boundary can reload the page. Caught
 * and shown as "still used by a model", it sent the visitor looking for a problem that was
 * not there (a model with no bikes reported as having some, 2026-10-07).
 */
export function rethrowIfStaleAction(error: unknown): void {
  if (unstable_isUnrecognizedActionError(error)) throw error
}
