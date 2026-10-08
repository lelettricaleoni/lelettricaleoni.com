import { afterEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import type { User } from '@supabase/supabase-js'
import { db, bikeReservations, bookings, customers } from '@/lib/db'
import { buildAccountExport, getCustomerLanguage, releaseCustomerOfAccount } from '@/lib/auth/account-data'
import { createFixture, insertBooking, insertOnlineLine, reservationValues, type Fixture } from './fixtures'

/**
 * What happens to the shop's record of a person when their account is deleted, what they can download, and the
 * language they chose. A customer with rentals is never deleted (the history and the takings refer to it).
 */
const made: string[] = []
const fixtures: Fixture[] = []
const stamp = Date.now().toString(36)
let counter = 0

async function customerOf(userId: string, overrides: Partial<typeof customers.$inferInsert> = {}) {
  const [row] = await db.insert(customers).values({
    firstName: 'Giulia', lastName: 'Verdi', email: `acct-${stamp}-${counter++}@example.test`, userId, ...overrides,
  }).returning()
  made.push(row.id)
  return row
}

afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await fixture.cleanup()
  if (made.length) {
    const ids = made.splice(0)
    await db.delete(bikeReservations).where(inArray(bikeReservations.customerId, ids))
    await db.delete(bookings).where(inArray(bookings.customerId, ids))
    await db.delete(customers).where(inArray(customers.id, ids))
  }
})

async function rentalFor(customerId: string) {
  const fixture = await createFixture(1)
  fixtures.push(fixture)
  await db.insert(bikeReservations).values(
    reservationValues(fixture.unitIds[0], '2026-11-02', '2026-11-04', { kind: 'counter_rental', customerId, amountCents: 3300 }),
  )
}

describe('releaseCustomerOfAccount', () => {
  it('deletes the customer of an account that has no rentals', async () => {
    const userId = randomUUID()
    const customer = await customerOf(userId)
    expect(await releaseCustomerOfAccount(userId)).toEqual({ kept: false, deleted: true })
    expect(await db.select().from(customers).where(eq(customers.id, customer.id))).toHaveLength(0)
  })

  it('keeps a customer with rentals, but unties it from the account', async () => {
    const userId = randomUUID()
    const customer = await customerOf(userId, { phone: `+39348${Math.floor(1000000 + Math.random() * 8999999)}` })
    await rentalFor(customer.id)
    expect(await releaseCustomerOfAccount(userId)).toEqual({ kept: true, deleted: false })
    const [row] = await db.select().from(customers).where(eq(customers.id, customer.id))
    expect(row).toMatchObject({ id: customer.id, userId: null, firstName: 'Giulia', phone: customer.phone })
  })

  it('deletes a customer whose only trace is online bookings that never got paid', async () => {
    const userId = randomUUID()
    const customer = await customerOf(userId)
    const fixture = await createFixture(1)
    fixtures.push(fixture)
    const range = { startsOn: '2031-12-01', endsOn: '2031-12-03' }
    await insertBooking(customer.id, range, { status: 'expired' }) // no bike was ever held
    const withBike = await insertBooking(customer.id, range, { status: 'expired' })
    await insertOnlineLine(withBike, customer.id, fixture.unitIds[0], range, 'expired')
    expect(await releaseCustomerOfAccount(userId)).toEqual({ kept: false, deleted: true })
    expect(await db.select().from(customers).where(eq(customers.id, customer.id))).toHaveLength(0)
    expect(await db.select().from(bookings).where(eq(bookings.customerId, customer.id))).toHaveLength(0)
  })

  it('keeps a customer with a paid online booking', async () => {
    const userId = randomUUID()
    const customer = await customerOf(userId)
    const fixture = await createFixture(1)
    fixtures.push(fixture)
    const range = { startsOn: '2031-12-01', endsOn: '2031-12-03' }
    const booking = await insertBooking(customer.id, range, { status: 'confirmed' })
    await insertOnlineLine(booking, customer.id, fixture.unitIds[0], range, 'confirmed')
    expect(await releaseCustomerOfAccount(userId)).toEqual({ kept: true, deleted: false })
  })

  it('does nothing for an account with no customer, and when it is asked twice', async () => {
    expect(await releaseCustomerOfAccount(randomUUID())).toEqual({ kept: false, deleted: false })
    const userId = randomUUID()
    await customerOf(userId)
    await releaseCustomerOfAccount(userId)
    expect(await releaseCustomerOfAccount(userId)).toEqual({ kept: false, deleted: false })
  })

  it('never touches the customer of another account', async () => {
    const mine = randomUUID()
    const other = await customerOf(randomUUID())
    await releaseCustomerOfAccount(mine)
    expect(await db.select().from(customers).where(eq(customers.id, other.id))).toHaveLength(1)
  })
})

describe('getCustomerLanguage', () => {
  it('is the language the person chose', async () => {
    const userId = randomUUID()
    await customerOf(userId, { language: 'de' })
    expect(await getCustomerLanguage(userId)).toBe('de')
  })

  it('is null when there is no customer', async () => {
    expect(await getCustomerLanguage(randomUUID())).toBeNull()
  })
})

describe('buildAccountExport', () => {
  const userFor = (id: string, email: string) => ({
    id, email, created_at: '2026-10-01T00:00:00Z', last_sign_in_at: '2026-10-07T00:00:00Z',
    identities: [{ provider: 'email' }, { provider: 'google' }],
  }) as unknown as User

  it('has everything about the person, the shop notes and the rentals included, and no ids', async () => {
    const userId = randomUUID()
    const customer = await customerOf(userId, { notes: 'casco M', language: 'en' })
    await rentalFor(customer.id)
    const data = await buildAccountExport(userFor(userId, 'giulia@example.test'))
    expect(data.account).toMatchObject({ email: 'giulia@example.test', signInMethods: ['email', 'google'] })
    expect(data.profile).toMatchObject({ firstName: 'Giulia', lastName: 'Verdi', language: 'en', shopNotes: 'casco M' })
    expect(data.rentals).toHaveLength(1)
    expect(data.rentals[0]).toMatchObject({ kind: 'counter_rental', status: 'confirmed', startsOn: '2026-11-02', endsOn: '2026-11-04', amount: 33 })
    const text = JSON.stringify(data)
    expect(text).not.toContain(customer.id)
    expect(text).not.toContain(userId)
  })

  it('is empty, and does not fail, for an account with no customer', async () => {
    const data = await buildAccountExport(userFor(randomUUID(), 'nobody@example.test'))
    expect(data.profile).toBeNull()
    expect(data.rentals).toEqual([])
  })
})
