import { timingSafeEqual } from 'node:crypto'

/**
 * Whether a call to a cron route carries the shared secret (`Authorization: Bearer <CRON_SECRET>`). With no secret configured nobody
 * gets in, and the comparison takes the same time whatever part of the secret was right.
 */
export function isCronRequest(authorization: string | null, secret: string | undefined): boolean {
  if (!secret) return false
  const given = Buffer.from(authorization ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}
