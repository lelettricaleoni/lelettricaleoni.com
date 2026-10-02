import { describe, it, expect } from 'vitest'
import {
  createRentalSchema, planMaintenanceSchema, updateMaintenanceSchema, moveReservationSchema, occupiedRangesSchema,
} from './reservation-schemas'

const id = () => crypto.randomUUID()
const rental = () => ({
  requestKey: id(), bikeModelId: id(), bikeSizeId: id(), bikeVersionId: id(),
  firstDay: '2026-07-10', lastDay: '2026-07-12', label: 'Rossi',
})

describe('createRentalSchema', () => {
  it('accepts a complete rental and defaults confirmDuplicate to false', () => {
    const parsed = createRentalSchema.parse(rental())
    expect(parsed.confirmDuplicate).toBe(false)
  })

  it('trims the name', () => {
    expect(createRentalSchema.parse({ ...rental(), label: '  Élodie  ' }).label).toBe('Élodie')
  })

  it('rejects an empty name and a name of only spaces', () => {
    expect(createRentalSchema.safeParse({ ...rental(), label: '' }).success).toBe(false)
    expect(createRentalSchema.safeParse({ ...rental(), label: '    ' }).success).toBe(false)
  })

  it('rejects a name longer than 120 characters', () => {
    expect(createRentalSchema.safeParse({ ...rental(), label: 'a'.repeat(121) }).success).toBe(false)
  })

  it('keeps accents and symbols in a name', () => {
    expect(createRentalSchema.parse({ ...rental(), label: 'Müller & Söhne 🚲' }).label).toBe('Müller & Söhne 🚲')
  })

  it('rejects impossible days and ids that are not uuids', () => {
    expect(createRentalSchema.safeParse({ ...rental(), firstDay: '2026-02-30' }).success).toBe(false)
    expect(createRentalSchema.safeParse({ ...rental(), lastDay: '10/07/2026' }).success).toBe(false)
    expect(createRentalSchema.safeParse({ ...rental(), requestKey: 'not-a-uuid' }).success).toBe(false)
  })

  it('says what is wrong with the name', () => {
    const result = createRentalSchema.safeParse({ ...rental(), label: ' ' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].message).toBe('Name is required')
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
