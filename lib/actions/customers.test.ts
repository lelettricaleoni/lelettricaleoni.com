import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ getAdminUser: vi.fn() }))
vi.mock('@/lib/customers', () => ({ createCustomer: vi.fn(), searchCustomers: vi.fn(), updateCustomer: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const scheduled: Array<() => unknown> = []
vi.mock('next/server', () => ({ after: (work: () => unknown) => { scheduled.push(work) } }))
vi.mock('@/lib/integrations/google-calendar/sync', () => ({ syncCustomerReservations: vi.fn() }))

import { getAdminUser } from '@/lib/supabase/server'
import * as customers from '@/lib/customers'
import { revalidatePath } from 'next/cache'
import { syncCustomerReservations } from '@/lib/integrations/google-calendar/sync'
import { createCustomerAction, searchCustomersAction, updateCustomerAction } from './customers'

const person = { firstName: 'Mario', lastName: 'Rossi', phone: '347 123 4567' }

beforeEach(() => {
  vi.resetAllMocks()
  scheduled.length = 0
  vi.mocked(getAdminUser).mockResolvedValue({ id: 'admin' } as never)
})

describe('createCustomerAction', () => {
  it('refuses anyone who is not an admin', async () => {
    vi.mocked(getAdminUser).mockResolvedValue(null as never)
    await expect(createCustomerAction(person)).rejects.toThrow('Unauthorized')
    expect(customers.createCustomer).not.toHaveBeenCalled()
  })

  it('says what is wrong, without touching the database', async () => {
    expect(await createCustomerAction({ ...person, phone: '123' })).toEqual({ status: 'invalid', message: 'Phone number is not valid' })
    expect(await createCustomerAction({ ...person, lastName: ' ' })).toEqual({ status: 'invalid', message: 'Last name is required' })
    expect(customers.createCustomer).not.toHaveBeenCalled()
  })

  it('passes the normalised details on and returns what the data layer says', async () => {
    const created = { status: 'created', customer: { id: 'c1' } } as never
    vi.mocked(customers.createCustomer).mockResolvedValue(created)
    expect(await createCustomerAction({ ...person, email: ' Mario@Example.com ' })).toBe(created)
    expect(customers.createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: 'Mario', lastName: 'Rossi', phone: '+393471234567', email: 'mario@example.com' }),
    )
  })
})

describe('searchCustomersAction', () => {
  it('refuses anyone who is not an admin: these are personal data', async () => {
    vi.mocked(getAdminUser).mockResolvedValue(null as never)
    await expect(searchCustomersAction({ query: 'mario' })).rejects.toThrow('Unauthorized')
    expect(customers.searchCustomers).not.toHaveBeenCalled()
  })

  it('searches with the trimmed text, and finds nothing for a bad input', async () => {
    vi.mocked(customers.searchCustomers).mockResolvedValue([])
    await searchCustomersAction({ query: '  mario ' })
    expect(customers.searchCustomers).toHaveBeenCalledWith('mario')
    expect(await searchCustomersAction({ query: 42 })).toEqual([])
  })
})

describe('updateCustomerAction', () => {
  const id = crypto.randomUUID()

  it('refuses anyone who is not an admin', async () => {
    vi.mocked(getAdminUser).mockResolvedValue(null as never)
    await expect(updateCustomerAction(id, person)).rejects.toThrow('Unauthorized')
    expect(customers.updateCustomer).not.toHaveBeenCalled()
  })

  it('says what is wrong, for the id as for the details, without touching the database', async () => {
    expect(await updateCustomerAction('not-a-uuid', person)).toEqual({ status: 'invalid', message: 'Invalid customer' })
    expect(await updateCustomerAction(id, { ...person, phone: '123' })).toEqual({ status: 'invalid', message: 'Phone number is not valid' })
    expect(customers.updateCustomer).not.toHaveBeenCalled()
  })

  it('saves the normalised details, refreshes the pages that show them and returns the outcome', async () => {
    const updated = { status: 'updated', customer: { id } } as never
    vi.mocked(customers.updateCustomer).mockResolvedValue(updated)
    expect(await updateCustomerAction(id, { ...person, email: ' Mario@Example.com ' })).toBe(updated)
    expect(customers.updateCustomer).toHaveBeenCalledWith(
      id, expect.objectContaining({ phone: '+393471234567', email: 'mario@example.com' }),
    )
    expect(revalidatePath).toHaveBeenCalledWith('/manage/customers', 'layout')
  })

  it('sends the customer\'s coming bookings to the calendar again, after the response: their name and phone are in the events', async () => {
    vi.mocked(customers.updateCustomer).mockResolvedValue({ status: 'updated', customer: { id } } as never)
    await updateCustomerAction(id, person)
    expect(scheduled).toHaveLength(1)
    expect(syncCustomerReservations).not.toHaveBeenCalled()
    await scheduled[0]()
    expect(syncCustomerReservations).toHaveBeenCalledWith(id)
  })

  it('does not refresh anything when the update did not happen', async () => {
    vi.mocked(customers.updateCustomer).mockResolvedValue({ status: 'not_found' })
    await updateCustomerAction(id, person)
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
