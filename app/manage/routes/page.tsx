import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { getRoutesForAdmin } from '@/lib/actions/routes'
import { getAdminUser } from '@/lib/supabase/server'
import { RouteListItem } from '@/components/admin/route-list-item'
import { redirect } from 'next/navigation'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function AdminRoutesPage() {
  const user = await getAdminUser()
  if (!user) redirect('/manage/login')

  const routesList = await getRoutesForAdmin()

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#1e3a5f]">Routes</h1>
        <Button asChild className="bg-[#1e3a5f] hover:bg-[#152c4a]">
          <Link href="/manage/routes/new"><Plus size={16} className="mr-1" /> New route</Link>
        </Button>
      </div>

      {routesList.length === 0 ? (
        <p className="text-muted-foreground text-sm">No routes yet. Create the first one!</p>
      ) : (
        <div className="space-y-3">
          {routesList.map(({ route, name }) => (
            <RouteListItem key={route.id} route={route} name={name ?? route.slug} />
          ))}
        </div>
      )}
    </div>
  )
}
