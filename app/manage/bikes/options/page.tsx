import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getAdminUser } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { listBikeSizes, listBikeVersions, listBikeCategories, listRouteBikeCategories } from '@/lib/actions/bike-options'
import { BikeSizeList } from '@/components/admin/bike-size-list'
import { BikeVersionList } from '@/components/admin/bike-version-list'
import { BikeCategoryList } from '@/components/admin/bike-category-list'
import { RouteBikeCategoryList } from '@/components/admin/route-bike-category-list'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function BikeOptionsPage() {
  const user = await getAdminUser()
  if (!user) redirect('/manage/login')

  const [sizes, versions, categories, routeCategories] = await Promise.all([
    listBikeSizes(),
    listBikeVersions(),
    listBikeCategories(),
    listRouteBikeCategories(),
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#1e3a5f]">Bike options</h1>
      <Tabs defaultValue="sizes">
        <TabsList>
          <TabsTrigger value="sizes">Sizes</TabsTrigger>
          <TabsTrigger value="versions">Versions</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="route-categories">Route categories</TabsTrigger>
        </TabsList>
        <TabsContent value="sizes"><BikeSizeList sizes={sizes} /></TabsContent>
        <TabsContent value="versions"><BikeVersionList versions={versions} /></TabsContent>
        <TabsContent value="categories"><BikeCategoryList categories={categories} routeCategories={routeCategories} /></TabsContent>
        <TabsContent value="route-categories"><RouteBikeCategoryList categories={routeCategories} /></TabsContent>
      </Tabs>
    </div>
  )
}
