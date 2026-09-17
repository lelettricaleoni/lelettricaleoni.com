import { BikeModelForm } from '@/components/admin/bike-model-form'
import { createBikeModelAction } from '@/lib/actions/bike-models'
import { listBikeCategories, listBikeSizes, listBikeVersions } from '@/lib/actions/bike-options'
import { getAdminUser } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function NewBikeModelPage() {
  const user = await getAdminUser()
  if (!user) redirect('/manage/login')

  const [categories, sizes, versions] = await Promise.all([
    listBikeCategories(), listBikeSizes(), listBikeVersions(),
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#1e3a5f]">New bike model</h1>
      <BikeModelForm action={createBikeModelAction} categories={categories} sizes={sizes} versions={versions} />
    </div>
  )
}
