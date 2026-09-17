import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { getBikeModelsForAdmin } from '@/lib/actions/bike-models'
import { getAdminUser } from '@/lib/supabase/server'
import { BikeModelListItem } from '@/components/admin/bike-model-list-item'
import { redirect } from 'next/navigation'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function AdminBikeModelsPage() {
  const user = await getAdminUser()
  if (!user) redirect('/manage/login')

  const models = await getBikeModelsForAdmin()

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#1e3a5f]">Bike models</h1>
        <Button asChild className="bg-[#1e3a5f] hover:bg-[#152c4a]">
          <Link href="/manage/bikes/new"><Plus size={16} className="mr-1" /> New model</Link>
        </Button>
      </div>

      {models.length === 0 ? (
        <p className="text-muted-foreground text-sm">No models yet. Create the first one!</p>
      ) : (
        <div className="space-y-3">
          {models.map(({ model, name }) => (
            <BikeModelListItem key={model.id} model={model} name={name ?? 'Untitled'} />
          ))}
        </div>
      )}
    </div>
  )
}
