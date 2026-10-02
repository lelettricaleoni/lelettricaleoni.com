'use server'
import { getAdminUser } from '@/lib/supabase/server'
import { customerSchema } from '@/lib/customer'
import { searchCustomersSchema, type ActionInvalid } from '@/lib/reservation-schemas'
import * as customers from '@/lib/customers'

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
