/**
 * A `next` path from the address, or the fallback when it is not one.
 *
 * It is glued to this site's own origin afterwards, so it has to be a path on this site: an
 * "@elsewhere.com" would make the origin read as credentials, and "//elsewhere.com" or
 * "/\elsewhere.com" would be taken as another host. A line break or a tab inside the path is
 * dropped by some clients, so "/\n/elsewhere.com" would become "//elsewhere.com" there.
 * (The same rule app/auth/callback/route.ts already had, in one place.)
 */
const BACKSLASH = String.fromCharCode(92)

export function safeNextPath(requested: string | null | undefined, fallback: string): string {
  if (!requested) return fallback
  if (!requested.startsWith('/') || requested.startsWith('//') || requested.startsWith('/' + BACKSLASH)) return fallback
  // Any control character: a line break, a tab, a NUL.
  for (let i = 0; i < requested.length; i++) {
    const code = requested.charCodeAt(i)
    if (code < 32 || code === 127) return fallback
  }
  return requested
}
