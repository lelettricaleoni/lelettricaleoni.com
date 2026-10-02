import { describe, it, expect } from 'vitest'
import {
  createRentalSchema, planMaintenanceSchema, updateMaintenanceSchema, moveReservationSchema, occupiedRangesSchema,
  retireBikeSchema, bikeUnitIdSchema, searchCustomersSchema,
} from './reservation-schemas'

const id = () => crypto.randomUUID()
const rental = () => ({
  requestKey: id(), bikeModelId: id(), bikeSizeId: id(), bikeVersionId: id(),
  firstDay: '2026-07-10', lastDay: '2026-07-12', customerId: id(),
})

describe('createRentalSchema', () => {
  it('accepts a complete rental and defaults confirmDuplicate to false', () => {
    const parsed = createRentalSchema.parse(rental())
    expect(parsed.confirmDuplicate).toBe(false)
  })

  it('needs the customer, as a uuid: who rents is chosen or created first', () => {
    const { customerId: _omitted, ...withoutCustomer } = rental()
    expect(createRentalSchema.safeParse(withoutCustomer).success).toBe(false)
    expect(createRentalSchema.safeParse({ ...rental(), customerId: 'Mario Rossi' }).success).toBe(false)
  })

  it('rejects impossible days and ids that are not uuids', () => {
    expect(createRentalSchema.safeParse({ ...rental(), firstDay: '2026-02-30' }).success).toBe(false)
    expect(createRentalSchema.safeParse({ ...rental(), lastDay: '10/07/2026' }).success).toBe(false)
    expect(createRentalSchema.safeParse({ ...rental(), requestKey: 'not-a-uuid' }).success).toBe(false)
  })
})

describe('searchCustomersSchema', () => {
  it('trims the search and refuses an absurdly long one', () => {
    expect(searchCustomersSchema.parse({ query: '  mario ros ' }).query).toBe('mario ros')
    expect(searchCustomersSchema.safeParse({ query: 'a'.repeat(101) }).success).toBe(false)
  })
})

describe('the other schemas', () => {
  it('accepts a maintenance without a reason, and with one', () => {
    const base = { requestKey: id(), bikeUnitId: id(), firstDay: '2026-07-10', lastDay: '2026-07-12' }
    expect(planMaintenanceSchema.safeParse(base).success).toBe(true)
    expect(planMaintenanceSchema.safeParse({ ...base, label: 'chain' }).success).toBe(true)
  })

  it('needs ids and days for an update, a move and the occupied ranges', () => {
    expect(updateMaintenanceSchema.safeParse({ id: id(), firstDay: '2026-07-10', lastDay: '2026-07-12' }).success).toBe(true)
    expect(moveReservationSchema.safeParse({ id: id(), bikeUnitId: id() }).success).toBe(true)
    expect(moveReservationSchema.safeParse({ id: id() }).success).toBe(false)
    expect(occupiedRangesSchema.safeParse({ bikeUnitId: id() }).success).toBe(true)
  })
})

describe('retiring a bike', () => {
  it('needs the bike and a real day', () => {
    expect(retireBikeSchema.safeParse({ id: id(), retiredOn: '2026-10-15' }).success).toBe(true)
    expect(retireBikeSchema.safeParse({ id: id(), retiredOn: '2026-02-30' }).success).toBe(false)
    expect(retireBikeSchema.safeParse({ id: id() }).success).toBe(false)
    expect(retireBikeSchema.safeParse({ id: 'nope', retiredOn: '2026-10-15' }).success).toBe(false)
  })

  it('needs just the bike to bring it back', () => {
    expect(bikeUnitIdSchema.safeParse({ id: id() }).success).toBe(true)
    expect(bikeUnitIdSchema.safeParse({ id: 'nope' }).success).toBe(false)
  })
})
