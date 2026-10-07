import { cache } from 'react'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * The signed-in user of this request, asked of the auth service once however many components want it: the
 * account layout and each of its pages need it, and `getUser` is a request to Supabase, not a read of the cookie.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})
