import { redirect } from 'next/navigation'
import { ShopHoursEditor } from '@/components/admin/shop-hours-editor'
import { getAdminUser } from '@/lib/supabase/server'
import { listClosures, loadShopSchedule } from '@/lib/shop-schedule-data'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function HoursPage() {
  const user = await getAdminUser()
  if (!user) redirect('/manage/login')

  const [schedule, closures] = await Promise.all([loadShopSchedule(), listClosures()])
  // Monday first: the seven days the editor shows.
  const week = [1, 2, 3, 4, 5, 6, 7].map((weekday) => schedule.weekly[weekday] ?? [])

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-brand-navy">Opening hours</h1>
      <ShopHoursEditor week={week} closures={closures} />
    </div>
  )
}
