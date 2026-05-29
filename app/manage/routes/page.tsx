import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { getRoutesForAdmin } from '@/lib/actions/routes'
import { getAdminUser } from '@/lib/supabase/server'
import { db, routeTranslations } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { RouteListItem } from '@/components/admin/route-list-item'
import { redirect } from 'next/navigation'

export default async function AdminPercorsiPage() {
  const user = await getAdminUser()
  if (!user) redirect('/manage/login')

  const routesList = await getRoutesForAdmin()

  const namesMap = new Map<string, string>()
  await Promise.all(
    routesList.map(async (r) => {
      const [tr] = await db
        .select({ name: routeTranslations.name })
        .from(routeTranslations)
        .where(and(eq(routeTranslations.routeId, r.id), eq(routeTranslations.locale, 'it')))
      namesMap.set(r.id, tr?.name ?? r.slug)
    })
  )

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#1e3a5f]">
          Percorsi
        </h1>
        <Button asChild className="bg-[#1e3a5f] hover:bg-[#152c4a]">
          <Link href="/manage/routes/new"><Plus size={16} className="mr-1" /> Nuovo percorso</Link>
        </Button>
      </div>

      {routesList.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nessun percorso ancora. Crea il primo!</p>
      ) : (
        <div className="space-y-3">
          {routesList.map((route) => (
            <RouteListItem key={route.id} route={route} name={namesMap.get(route.id) ?? route.slug} />
          ))}
        </div>
      )}
    </div>
  )
}
