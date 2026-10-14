import { redirect } from 'next/navigation'
import { getAdminUser } from '@/lib/supabase/server'
import { getRentalOptions } from '@/lib/rental-options-data'
import { getGrid } from '@/lib/reservations'
import { currentMonthInRome, monthDays, parseMonth, todayInRome } from '@/lib/dates'
import { closedDaysAmong } from '@/lib/shop-schedule'
import { loadShopSchedule } from '@/lib/shop-schedule-data'
import { BookingView } from '@/components/admin/booking-view'

// Read live: the calendar must be exact, not "within 10-30 seconds" like the cached catalogues.
export const instant = false

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await getAdminUser()
  if (!user) redirect('/manage/login')

  const { month: monthParam } = await searchParams
  const month = parseMonth(monthParam) ?? currentMonthInRome()

  const [units, models, schedule] = await Promise.all([getGrid(month), getRentalOptions(), loadShopSchedule()])
  const closedDays = closedDaysAmong(schedule, monthDays(month))

  return <BookingView month={month} today={todayInRome()} units={units} models={models} closedDays={closedDays} />
}
