import { redirect } from 'next/navigation'
import { getAdminUser } from '@/lib/supabase/server'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function ManagePage() {
  const user = await getAdminUser()
  if (!user) redirect('/manage/login')

  return (
    <h1 className="text-2xl font-bold text-[#1e3a5f]">Manage</h1>
  )
}
