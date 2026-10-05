import { redirect } from 'next/navigation'
import { getAdminUser } from '@/lib/supabase/server'
import { listCustomers } from '@/lib/customers'
import { CustomersView } from '@/components/admin/customers-view'

// Read live: these are people and money, never "within 10-30 seconds".
export const instant = false

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await getAdminUser()
  if (!user) redirect('/manage/login')

  const { q = '' } = await searchParams
  const query = q.trim().slice(0, 100)
  return <CustomersView customers={await listCustomers({ query })} query={query} />
}
