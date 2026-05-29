import { RouteForm } from '@/components/admin/route-form'
import { updateRouteAction, getRouteWithDetails } from '@/lib/actions/routes'
import { getAdminUser } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'

export default async function EditPercorsoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getAdminUser()
  if (!user) redirect('/gestione/login')

  const { id } = await params
  const data = await getRouteWithDetails(id)
  if (!data) notFound()

  const action = updateRouteAction.bind(null, id)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#1e3a5f]">Modifica percorso</h1>
      <RouteForm
        action={action}
        route={data.route}
        translations={data.translations}
        photos={data.photos}
      />
    </div>
  )
}
