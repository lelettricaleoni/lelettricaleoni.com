import { RouteForm } from '@/components/admin/route-form'
import { createRouteAction } from '@/lib/actions/routes'
import { getAdminUser } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function NuovoPercorsoPage() {
  const user = await getAdminUser()
  if (!user) redirect('/gestione/login')

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#1e3a5f]">Nuovo percorso</h1>
      <RouteForm action={createRouteAction} />
    </div>
  )
}
