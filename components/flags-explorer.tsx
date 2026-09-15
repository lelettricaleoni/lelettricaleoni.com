import { FlagValues } from 'flags/react'
import type { Flags } from '@/lib/flags'

/**
 * Exposes the resolved flag values in the page so Vercel's Flags Explorer
 * (in the Toolbar) can read and override them per-viewer, without touching
 * what real visitors see.
 *
 * Preview only, on purpose: on *.vercel.app the Toolbar is already injected
 * automatically for signed-in team members, so this is all that's needed —
 * production stays untouched, with no extra script and no override surface.
 */
export function FlagsExplorer({ flags }: { flags: Flags }) {
  if (process.env.VERCEL_ENV === 'production') return null
  return <FlagValues values={flags} />
}
