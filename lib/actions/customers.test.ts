import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ getAdminUser: vi.fn() }))
vi.mock('@/lib/customers', () => ({ createCustomer: vi.fn(), searchCustomers: vi.fn() }))

import { getAdminUser } from '@/lib/supabase/server'
import * as customers from '@/lib/customers'
import { createCustomerAction, searchCustomersAction } from './customers'

const person = { firstName: 'Mario', lastName: 'Rossi', phone: '347 123 4567' }

beforeEach(() => {
  vi.resetAllMocks()
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
