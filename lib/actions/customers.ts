'use server'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { customerSchema } from '@/lib/customer'
import { searchCustomersSchema, type ActionInvalid } from '@/lib/reservation-schemas'
import * as customers from '@/lib/customers'
import { syncCustomerReservations } from '@/lib/integrations/google-calendar/sync'

// Personal data: every action checks the admin first, and nothing here is cached.
async function requireAdmin() {
  const user = await getAdminUser()
  if (!user) throw new Error('Unauthorized')
}

export async function createCustomerAction(input: unknown): Promise<customers.CreateCustomerResult | ActionInvalid> {
  await requireAdmin()
  const parsed = customerSchema.safeParse(input)
  if (!parsed.success) return { status: 'invalid', message: parsed.error.issues[0]?.message ?? 'Invalid input' }
  return customers.createCustomer(parsed.data)
}

export async function searchCustomersAction(input: unknown): Promise<customers.CustomerSummary[]> {
  await requireAdmin()
  const parsed = searchCustomersSchema.safeParse(input)
  return parsed.success ? customers.searchCustomers(parsed.data.query) : []
}

export async function updateCustomerAction(id: unknown, input: unknown): Promise<customers.UpdateCustomerResult | ActionInvalid> {
  await requireAdmin()
  const parsedId = z.uuid().safeParse(id)
  if (!parsedId.success) return { status: 'invalid', message: 'Invalid customer' }
  const parsed = customerSchema.safeParse(input)
  if (!parsed.success) return { status: 'invalid', message: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const result = await customers.updateCustomer(parsedId.data, parsed.data)
  // The Customers pages read live: only the page has to be read again.
  if (result.status === 'updated') {
    revalidatePath('/manage/customers', 'layout')
    // The events carry the name and the phone: after the response, send the coming bookings again.
    after(() => syncCustomerReservations(parsedId.data))
  }
  return result
}
