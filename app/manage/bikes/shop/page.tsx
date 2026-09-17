import { getAdminUser } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getBikeUnitsForAdmin, getPublishedModelsWithAllowedOptions } from '@/lib/actions/bike-units'
import { BikeUnitForm } from '@/components/admin/bike-unit-form'
import { BikeUnitList } from '@/components/admin/bike-unit-list'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function BikeShopPage() {
  const user = await getAdminUser()
  if (!user) redirect('/manage/login')

  const [units, models] = await Promise.all([
    getBikeUnitsForAdmin(),
    getPublishedModelsWithAllowedOptions(),
  ])

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-[#1e3a5f]">Il mio negozio</h1>
      <BikeUnitForm models={models} />
      <BikeUnitList units={units} />
    </div>
  )
}
