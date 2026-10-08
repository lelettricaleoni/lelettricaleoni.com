import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { inArray } from 'drizzle-orm'
import { db, customers } from '@/lib/db'
import { createCounterRental, cancelReservation, planMaintenance } from '@/lib/reservations'
import { createCustomer, getCustomerDetail, listCustomers, updateCustomer } from '@/lib/customers'
import { createFixture, type Fixture } from './fixtures'

let fx: Fixture
const extraCustomers: string[] = []

beforeEach(async () => { fx = await createFixture(3) })
afterEach(async () => {
  await fx.cleanup()
  if (extraCustomers.length) await db.delete(customers).where(inArray(customers.id, extraCustomers))
  extraCustomers.length = 0
})

function rent(startsOn: string, endsOn: string, amountCents: number) {
  return createCounterRental({
    requestKey: crypto.randomUUID(), bikeModelId: fx.modelId, bikeSizeId: fx.sizeId, bikeVersionId: fx.versionId,
    startsOn, endsOn, customerId: fx.customerId, amountCents, confirmDuplicate: true,
  })
}

async function rented(startsOn: string, endsOn: string, amountCents: number) {
  const result = await rent(startsOn, endsOn, amountCents)
  if (result.status !== 'created') throw new Error(`expected created, got ${result.status}`)
  return result.reservationId
}

describe('listCustomers', () => {
  const mine = async (query = '') => (await listCustomers({ query })).find((c) => c.id === fx.customerId)

  it('counts the confirmed rentals and adds up what they were paid', async () => {
    await rented('2031-07-10', '2031-07-13', 4500)
    await rented('2031-08-01', '2031-08-03', 3000)
    expect(await mine()).toMatchObject({ rentals: 2, revenueCents: 7500, lastRentalOn: '2031-08-01' })
  })

  it('leaves out cancelled rentals and maintenance from the numbers', async () => {
    const cancelled = await rented('2031-07-10', '2031-07-13', 9900)
    await cancelReservation(cancelled)
    await rented('2031-09-01', '2031-09-02', 1000)
    await planMaintenance({ requestKey: crypto.randomUUID(), bikeUnitId: fx.unitIds[0], startsOn: '2031-10-01', endsOn: '2031-10-05', label: 'chain' })
    expect(await mine()).toMatchObject({ rentals: 1, revenueCents: 1000, lastRentalOn: '2031-09-01' })
  })

  it('lists a customer with no rentals too, with zeros and no last rental', async () => {
    expect(await mine()).toMatchObject({ rentals: 0, revenueCents: 0, lastRentalOn: null })
  })

  it('filters by what is typed, like the search in the form', async () => {
    expect(await mine('db-test')).toBeDefined()
    expect(await mine('zzz-nobody-called-this')).toBeUndefined()
  })
})

describe('getCustomerDetail', () => {
  it('returns null for a customer that does not exist', async () => {
    expect(await getCustomerDetail(crypto.randomUUID())).toBeNull()
  })

  it('has the totals and every rental, the newest first, cancelled ones included but not counted', async () => {
    await rented('2031-07-10', '2031-07-13', 4500)
    const cancelled = await rented('2031-08-01', '2031-08-03', 3000)
    await cancelReservation(cancelled)
    await rented('2031-09-01', '2031-09-02', 1000)

    const detail = await getCustomerDetail(fx.customerId)
    expect(detail!.customer).toMatchObject({ id: fx.customerId, firstName: 'db-test' })
    expect(detail!.stats).toMatchObject({ rentals: 2, revenueCents: 5500, firstRentalOn: '2031-07-10', lastRentalOn: '2031-09-01' })
    expect(detail!.rentals.map((r) => [r.startsOn, r.status, r.amountCents])).toEqual([
      ['2031-09-01', 'confirmed', 1000],
      ['2031-08-01', 'cancelled', 3000],
      ['2031-07-10', 'confirmed', 4500],
    ])
  })

  it('says which bike each rental was, and the days it lasted', async () => {
    await rented('2031-07-10', '2031-07-13', 4500)
    const [rental] = (await getCustomerDetail(fx.customerId))!.rentals
    // "model · size · version · short id" of whichever of the three bikes the rental was given
    expect(fx.unitIds.some((unitId) => rental.bike.endsWith(` · ${unitId.slice(0, 8)}`))).toBe(true)
    expect(rental).toMatchObject({ startsOn: '2031-07-10', endsOn: '2031-07-13' })
  })
})

describe('updateCustomer', () => {
  const person = (overrides: Record<string, string | undefined> = {}) => ({
    firstName: 'Mario', lastName: `db-test-${crypto.randomUUID()}`, ...overrides,
  })

  it('changes the details of a customer, the rentals follow', async () => {
    await rented('2031-07-10', '2031-07-13', 4500)
    const result = await updateCustomer(fx.customerId, person({ firstName: 'Maria', phone: '+393479990000', email: 'maria@example.com', notes: 'casco S' }))
    expect(result.status).toBe('updated')
    const detail = await getCustomerDetail(fx.customerId)
    expect(detail!.customer).toMatchObject({ firstName: 'Maria', phone: '+393479990000', email: 'maria@example.com', notes: 'casco S' })
    expect(detail!.rentals).toHaveLength(1)
  })

  it('clears a contact that is left out', async () => {
    await updateCustomer(fx.customerId, person({ phone: '+393479990001' }))
    await updateCustomer(fx.customerId, person())
    expect((await getCustomerDetail(fx.customerId))!.customer.phone).toBeNull()
  })

  it('refuses an email that belongs to another customer, and says who has it', async () => {
    const other = await createCustomer(person({ phone: '+393478880000', email: `${crypto.randomUUID()}@example.com` }))
    extraCustomers.push(other.customer.id)
    const email = await updateCustomer(fx.customerId, person({ email: other.customer.email! }))
    expect(email).toMatchObject({ status: 'conflict', other: { id: other.customer.id } })
  })

  it('accepts a phone that another customer already has', async () => {
    const other = await createCustomer(person({ phone: '+393478880001' }))
    extraCustomers.push(other.customer.id)
    expect((await updateCustomer(fx.customerId, person({ phone: '+393478880001' }))).status).toBe('updated')
  })

  it('lets a customer keep its own phone', async () => {
    await updateCustomer(fx.customerId, person({ phone: '+393477770000' }))
    expect((await updateCustomer(fx.customerId, person({ phone: '+393477770000', notes: 'x' }))).status).toBe('updated')
  })

  it('says not_found for a customer that does not exist', async () => {
    expect((await updateCustomer(crypto.randomUUID(), person())).status).toBe('not_found')
  })
})
