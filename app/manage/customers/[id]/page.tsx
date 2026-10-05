import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { getCustomerDetail } from '@/lib/customers'
import { CustomerView } from '@/components/admin/customers-view'

export const instant = false

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getAdminUser()
  if (!user) redirect('/manage/login')

  const { id } = await params
  // Something that is not a uuid is a customer that does not exist, not an error of the database.
  const detail = z.uuid().safeParse(id).success ? await getCustomerDetail(id) : null
  if (!detail) notFound()
  return <CustomerView detail={detail} />
}
