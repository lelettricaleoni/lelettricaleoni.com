import { redirect } from 'next/navigation'
import { getAdminUser } from '@/lib/supabase/server'
import { getGrid } from '@/lib/reservations'
import { currentMonthInRome, parseMonth, todayInRome } from '@/lib/dates'
import { BookingView } from '@/components/admin/booking-view'

// Read live: the calendar must be exact, not "within 10-30 seconds" like the cached catalogues.
export const instant = false

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await getAdminUser()
  if (!user) redirect('/manage/login')

  const { month: monthParam } = await searchParams
  const month = parseMonth(monthParam) ?? currentMonthInRome()

  return <BookingView month={month} today={todayInRome()} units={await getGrid(month)} />
}
