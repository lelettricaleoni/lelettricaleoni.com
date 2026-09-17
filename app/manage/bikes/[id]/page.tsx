import { BikeModelForm } from '@/components/admin/bike-model-form'
import { updateBikeModelAction, getBikeModelWithDetails } from '@/lib/actions/bike-models'
import { listBikeCategories, listBikeSizes, listBikeVersions } from '@/lib/actions/bike-options'
import { getAdminUser } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function EditBikeModelPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getAdminUser()
  if (!user) redirect('/manage/login')

  const { id } = await params
  const [data, categories, sizes, versions] = await Promise.all([
    getBikeModelWithDetails(id), listBikeCategories(), listBikeSizes(), listBikeVersions(),
  ])
  if (!data) notFound()

  const action = updateBikeModelAction.bind(null, id)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#1e3a5f]">Edit bike model</h1>
      <BikeModelForm
        action={action}
        categories={categories} sizes={sizes} versions={versions}
        model={data.model} translations={data.translations} photos={data.photos}
        selectedSizeIds={data.sizeIds} selectedVersionIds={data.versionIds}
      />
    </div>
  )
}
