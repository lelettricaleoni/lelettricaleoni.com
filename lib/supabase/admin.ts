import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * The client that may create accounts and change roles.
 *
 * Its key bypasses every row-level policy, so it must never be bundled for the
 * browser. Two things keep it there: `server-only`, which turns an accidental
 * import from a client component into a build error rather than a leak, and
 * the fact that the only callers are Server Actions in `lib/actions/users.ts`.
 *
 * No session is kept and no token refreshed: each call is one authenticated
 * request, and persisting anything would mean writing this key into a store.
 */
export function createSupabaseAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error('Account administration is not configured on this deployment')
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
