import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db, customers } from '@/lib/db'
import { linkCustomerToAccount } from '@/lib/auth/customer-link'

/**
 * An account becomes a customer, or is tied to the one the shop already has under the same email,
 * but only when the email is confirmed: anyone can type somebody else's address into a sign-up form.
 */
const created: string[] = []
const stamp = Date.now().toString(36)
let counter = 0
const email = () => `link-${stamp}-${counter++}@example.test`

async function insertCustomer(values: Partial<typeof customers.$inferInsert> & { email: string }) {
  const [row] = await db.insert(customers).values({ firstName: 'Mario', lastName: 'Rossi', ...values }).returning()
  created.push(row.id)
  return row
}
const byUser = (userId: string) => db.select().from(customers).where(eq(customers.userId, userId))
const byEmail = (address: string) => db.select().from(customers).where(eq(customers.email, address))

let userId: string
beforeEach(() => { userId = randomUUID() })
afterEach(async () => {
  const rows = await db.select().from(customers).where(eq(customers.userId, userId))
  created.push(...rows.map((r) => r.id))
  if (created.length) await db.delete(customers).where(inArray(customers.id, created.splice(0)))
})

describe('linkCustomerToAccount', () => {
  it('creates a customer for a confirmed account the shop does not know', async () => {
    const address = email()
    const result = await linkCustomerToAccount({ userId, email: address, emailConfirmed: true, firstName: 'Giulia', lastName: 'Verdi' })
    expect(result.status).toBe('created')
    const [row] = await byUser(userId)
    expect(row).toMatchObject({ email: address, firstName: 'Giulia', lastName: 'Verdi' })
  })

  it('ties the account to the customer the shop already has under the same email, keeping what the shop knows', async () => {
    const address = email()
    const existing = await insertCustomer({ email: address, phone: `+39333${Math.floor(1000000 + Math.random() * 8999999)}`, notes: 'casco M' })
    const result = await linkCustomerToAccount({ userId, email: address, emailConfirmed: true, firstName: 'Altro', lastName: 'Nome' })
    expect(result).toEqual({ status: 'linked', customerId: existing.id })
    const [row] = await byUser(userId)
    expect(row).toMatchObject({ id: existing.id, firstName: 'Mario', lastName: 'Rossi', notes: 'casco M', phone: existing.phone })
    expect(await byEmail(address)).toHaveLength(1)
  })

  it('matches the email whatever the case', async () => {
    const address = email()
    const existing = await insertCustomer({ email: address })
    const result = await linkCustomerToAccount({ userId, email: address.toUpperCase(), emailConfirmed: true })
    expect(result).toEqual({ status: 'linked', customerId: existing.id })
  })

  it('is the same customer when it is asked again', async () => {
    const address = email()
    const first = await linkCustomerToAccount({ userId, email: address, emailConfirmed: true, firstName: 'Giulia', lastName: 'Verdi' })
    const second = await linkCustomerToAccount({ userId, email: address, emailConfirmed: true, firstName: 'Giulia', lastName: 'Verdi' })
    expect(first.status).toBe('created')
    expect(second.status).toBe('existing')
    if (first.status === 'created' && second.status === 'existing') expect(second.customerId).toBe(first.customerId)
    expect(await byUser(userId)).toHaveLength(1)
  })

  it('never ties or creates anything for an account whose email is not confirmed', async () => {
    const address = email()
    const existing = await insertCustomer({ email: address })
    const result = await linkCustomerToAccount({ userId, email: address, emailConfirmed: false, firstName: 'Mallory', lastName: 'X' })
    expect(result).toEqual({ status: 'unverified' })
    expect(await byUser(userId)).toHaveLength(0)
    const [row] = await byEmail(address)
    expect(row.id).toBe(existing.id)
    expect(row.userId).toBeNull()
    // And an unknown address is not turned into a customer either.
    expect(await linkCustomerToAccount({ userId, email: email(), emailConfirmed: false })).toEqual({ status: 'unverified' })
    expect(await byUser(userId)).toHaveLength(0)
  })

  it('does not take a customer that already belongs to another account', async () => {
    const address = email()
    const otherUser = randomUUID()
    const existing = await insertCustomer({ email: address, userId: otherUser })
    const result = await linkCustomerToAccount({ userId, email: address, emailConfirmed: true, firstName: 'Mallory', lastName: 'X' })
    expect(result).toEqual({ status: 'taken' })
    const [row] = await byEmail(address)
    expect(row).toMatchObject({ id: existing.id, userId: otherUser })
    expect(await byUser(userId)).toHaveLength(0)
  })

  it('gives a nameless account a name from its email, because a customer needs one', async () => {
    const address = email()
    await linkCustomerToAccount({ userId, email: address, emailConfirmed: true })
    const [row] = await byUser(userId)
    expect(row.firstName).toBe(address.split('@')[0])
    expect(row.lastName).toBe('')
  })

  it('makes one customer when the same account is linked twice at once', async () => {
    const address = email()
    const results = await Promise.all([
      linkCustomerToAccount({ userId, email: address, emailConfirmed: true, firstName: 'Giulia', lastName: 'Verdi' }),
      linkCustomerToAccount({ userId, email: address, emailConfirmed: true, firstName: 'Giulia', lastName: 'Verdi' }),
    ])
    expect(results.every((r) => r.status === 'created' || r.status === 'existing' || r.status === 'linked')).toBe(true)
    expect(await byUser(userId)).toHaveLength(1)
    expect(await byEmail(address)).toHaveLength(1)
  })

  describe('the phone', () => {
    const phone = () => `+39349${Math.floor(1000000 + Math.random() * 8999999)}`

    it('is kept on the customer made for the account', async () => {
      const number = phone()
      await linkCustomerToAccount({ userId, email: email(), emailConfirmed: true, firstName: 'Giulia', lastName: 'Verdi', phone: number })
      const [row] = await byUser(userId)
      expect(row.phone).toBe(number)
    })

    it('fills the phone of a customer the shop had without one', async () => {
      const address = email()
      const number = phone()
      await insertCustomer({ email: address })
      await linkCustomerToAccount({ userId, email: address, emailConfirmed: true, phone: number })
      const [row] = await byUser(userId)
      expect(row.phone).toBe(number)
    })

    it('keeps the phone the shop already has: the shop wrote it, the account only offers one', async () => {
      const address = email()
      const shops = phone()
      await insertCustomer({ email: address, phone: shops })
      await linkCustomerToAccount({ userId, email: address, emailConfirmed: true, phone: phone() })
      const [row] = await byUser(userId)
      expect(row.phone).toBe(shops)
    })

    it('leaves the phone out, and still links, when it belongs to another customer', async () => {
      const taken = phone()
      await insertCustomer({ email: email(), phone: taken })
      const address = email()
      const existing = await insertCustomer({ email: address })
      const result = await linkCustomerToAccount({ userId, email: address, emailConfirmed: true, phone: taken })
      expect(result).toEqual({ status: 'linked', customerId: existing.id })
      const [row] = await byUser(userId)
      expect(row.phone).toBeNull()
      // the same for a customer made from scratch
      const other = randomUUID()
      const made = await linkCustomerToAccount({ userId: other, email: email(), emailConfirmed: true, phone: taken })
      expect(made.status).toBe('created')
      const [madeRow] = await byUser(other)
      expect(madeRow.phone).toBeNull()
      await db.delete(customers).where(eq(customers.userId, other))
    })

    it('does not touch the phone when none is offered', async () => {
      const address = email()
      const shops = phone()
      await insertCustomer({ email: address, phone: shops })
      await linkCustomerToAccount({ userId, email: address, emailConfirmed: true })
      const [row] = await byUser(userId)
      expect(row.phone).toBe(shops)
    })
  })

  it('does nothing without an email', async () => {
    expect(await linkCustomerToAccount({ userId, email: null, emailConfirmed: true })).toEqual({ status: 'no-email' })
    expect(await byUser(userId)).toHaveLength(0)
  })
})
