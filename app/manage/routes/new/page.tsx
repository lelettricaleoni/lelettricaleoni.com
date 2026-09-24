import { RouteForm } from '@/components/admin/route-form'
import { createRouteAction } from '@/lib/actions/routes'
import { listRouteBikeCategories } from '@/lib/actions/bike-options'
import { getAdminUser } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function NewRoutePage() {
  const user = await getAdminUser()
  if (!user) redirect('/manage/login')

  const routeBikeCategories = await listRouteBikeCategories()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#1e3a5f]">New route</h1>
      <RouteForm action={createRouteAction} bikeTypeOptions={routeBikeCategories.map((c) => c.name)} />
    </div>
  )
}
