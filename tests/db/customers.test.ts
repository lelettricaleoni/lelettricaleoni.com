import { afterEach, describe, expect, it } from 'vitest'
import { inArray, like } from 'drizzle-orm'
import { db, customers } from '@/lib/db'
import { createCustomer, searchCustomers, type CustomerSummary } from '@/lib/customers'

/** Everything these tests create carries this tag in the last name, so cleanup cannot touch real data. */
const TAG = `dbtest${crypto.randomUUID().slice(0, 8)}`
const made: string[] = []

async function create(input: Parameters<typeof createCustomer>[0]) {
  const result = await createCustomer(input)
  made.push(result.customer.id)
  return result
}

const person = (overrides: Record<string, string | undefined> = {}) => ({
  firstName: 'Mario', lastName: `${TAG}Rossi`, ...overrides,
})

afterEach(async () => {
  if (made.length) await db.delete(customers).where(inArray(customers.id, made))
  made.length = 0
  await db.delete(customers).where(like(customers.lastName, `${TAG}%`))
})

describe('createCustomer', () => {
  it('creates a customer with name, phone, email and notes', async () => {
    const result = await create(person({ phone: '+393471234567', email: 'mario@example.com', notes: 'casco M' }))
    expect(result.status).toBe('created')
    expect(result.customer).toMatchObject({
      firstName: 'Mario', lastName: `${TAG}Rossi`, phone: '+393471234567', email: 'mario@example.com', notes: 'casco M',
    })
  })

  it('needs no contact: two people with only a name are two customers', async () => {
    const a = await create(person())
    const b = await create(person())
    expect(a.status).toBe('created')
    expect(b.status).toBe('created')
    expect(a.customer.id).not.toBe(b.customer.id)
  })

  it('lets two people share a phone number: a couple or a family has one', async () => {
    const first = await create(person({ phone: '+393471111111' }))
    const second = await create(person({ firstName: 'Maria', phone: '+393471111111' }))
    expect(first.status).toBe('created')
    expect(second.status).toBe('created')
    expect(second.customer.id).not.toBe(first.customer.id)
    expect(second.customer.phone).toBe(first.customer.phone)
  })

  it('returns the existing customer when the email is already known', async () => {
    const first = await create(person({ email: `${TAG}@example.com` }))
    const second = await create(person({ firstName: 'Maria', email: `${TAG}@example.com` }))
    expect(second.status).toBe('exists')
    expect(second.customer.id).toBe(first.customer.id)
  })

  it('treats the same name with different contacts as different people', async () => {
    const a = await create(person({ phone: '+393472222222' }))
    const b = await create(person({ phone: '+393473333333' }))
    expect(a.status).toBe('created')
    expect(b.status).toBe('created')
  })
})

describe('searchCustomers', () => {
  const ids = (list: CustomerSummary[]) => list.map((c) => c.id)

  it('finds a customer by part of the first or the last name, ignoring case', async () => {
    const { customer } = await create(person({ firstName: 'Élodie' }))
    expect(ids(await searchCustomers(`${TAG.toLowerCase()}ros`))).toContain(customer.id)
    expect(ids(await searchCustomers('élodie'))).toContain(customer.id)
  })

  it('finds by first and last name together, in either order', async () => {
    const { customer } = await create(person({ firstName: 'Zeffirino' }))
    expect(ids(await searchCustomers(`zeffirino ${TAG}`))).toContain(customer.id)
    expect(ids(await searchCustomers(`${TAG} zeffirino`))).toContain(customer.id)
    expect(ids(await searchCustomers(`zeffirino nonesiste${TAG}`))).not.toContain(customer.id)
  })

  it('finds by the phone, however it is typed', async () => {
    const { customer } = await create(person({ phone: '+393479876543' }))
    expect(ids(await searchCustomers('347 98765'))).toContain(customer.id)
    expect(ids(await searchCustomers('+39347987'))).toContain(customer.id)
  })

  it('finds by the email', async () => {
    const { customer } = await create(person({ email: `${TAG}.cerca@example.com` }))
    expect(ids(await searchCustomers(`${TAG}.cerca`))).toContain(customer.id)
  })

  it('takes % and _ as plain characters, not as wildcards', async () => {
    await create(person())
    expect(await searchCustomers('%')).toEqual([])
    expect(await searchCustomers('_')).toEqual([])
  })

  it('returns nothing for a blank search and at most a handful for a broad one', async () => {
    expect(await searchCustomers('   ')).toEqual([])
    for (let i = 0; i < 12; i++) await create(person({ firstName: `Gruppo${i}` }))
    expect((await searchCustomers('gruppo')).length).toBeLessThanOrEqual(8)
  })

  it('returns the contact details the form shows next to a name', async () => {
    const { customer } = await create(person({ phone: '+393470001111', email: `${TAG}.x@example.com` }))
    const found = (await searchCustomers(TAG)).find((c) => c.id === customer.id)
    expect(found).toMatchObject({ firstName: 'Mario', lastName: `${TAG}Rossi`, phone: '+393470001111', email: `${TAG}.x@example.com` })
  })
})
