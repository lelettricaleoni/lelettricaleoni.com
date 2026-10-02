import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ getAdminUser: vi.fn() }))
vi.mock('@/lib/reservations', () => ({
  createCounterRental: vi.fn(),
  cancelReservation: vi.fn(),
  moveReservation: vi.fn(),
  getMoveCandidates: vi.fn(),
  planMaintenance: vi.fn(),
  updateMaintenance: vi.fn(),
  getOccupiedRanges: vi.fn(),
}))

import { getAdminUser } from '@/lib/supabase/server'
import * as reservations from '@/lib/reservations'
import * as actions from './reservations'
import {
  cancelReservationAction, createRentalAction, getMoveCandidatesAction, getOccupiedRangesAction,
  moveReservationAction, planMaintenanceAction, updateMaintenanceAction,
} from './reservations'

const id = () => crypto.randomUUID()
const rentalInput = () => ({
  requestKey: id(), bikeModelId: id(), bikeSizeId: id(), bikeVersionId: id(),
  firstDay: '2026-07-10', lastDay: '2026-07-12', label: 'Rossi',
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getAdminUser).mockResolvedValue({ id: 'admin' } as never)
})

describe('createRentalAction', () => {
  it('refuses anyone who is not an admin', async () => {
    vi.mocked(getAdminUser).mockResolvedValue(null as never)
    await expect(createRentalAction(rentalInput())).rejects.toThrow('Unauthorized')
    expect(reservations.createCounterRental).not.toHaveBeenCalled()
  })

  it('answers invalid for bad input, without touching the database', async () => {
    const result = await createRentalAction({ ...rentalInput(), requestKey: 'nope' })
    expect(result.status).toBe('invalid')
    expect(reservations.createCounterRental).not.toHaveBeenCalled()
  })

  it('answers invalid when the last day is before the first', async () => {
    const result = await createRentalAction({ ...rentalInput(), firstDay: '2026-07-12', lastDay: '2026-07-10' })
    expect(result).toEqual({ status: 'invalid', message: 'The last day cannot be before the first day' })
  })

  it('passes the stored range to the data layer: the end is exclusive', async () => {
    vi.mocked(reservations.createCounterRental).mockResolvedValue({ status: 'no_bike_free' })
    await createRentalAction(rentalInput())
    expect(reservations.createCounterRental).toHaveBeenCalledWith(
      expect.objectContaining({ startsOn: '2026-07-10', endsOn: '2026-07-13', label: 'Rossi', confirmDuplicate: false }),
    )
  })

  it('returns what the data layer says', async () => {
    vi.mocked(reservations.createCounterRental).mockResolvedValue({ status: 'no_bike_free' })
    expect(await createRentalAction(rentalInput())).toEqual({ status: 'no_bike_free' })
  })
})

describe('maintenance actions', () => {
  it('turns the last day included into the exclusive end, and an empty reason into null', async () => {
    vi.mocked(reservations.planMaintenance).mockResolvedValue({ status: 'planned', reservationId: id(), replayed: false })
    await planMaintenanceAction({ requestKey: id(), bikeUnitId: id(), firstDay: '2026-07-10', lastDay: '2026-07-10' })
    expect(reservations.planMaintenance).toHaveBeenCalledWith(
      expect.objectContaining({ startsOn: '2026-07-10', endsOn: '2026-07-11', label: null }),
    )
  })

  it('rejects a reversed range on update', async () => {
    const result = await updateMaintenanceAction({ id: id(), firstDay: '2026-07-12', lastDay: '2026-07-10' })
    expect(result.status).toBe('invalid')
    expect(reservations.updateMaintenance).not.toHaveBeenCalled()
  })
})

describe('every action refuses anyone who is not an admin', () => {
  const calls: Record<string, () => Promise<unknown>> = {
    createRentalAction: () => createRentalAction(rentalInput()),
    cancelReservationAction: () => cancelReservationAction({ id: id() }),
    moveReservationAction: () => moveReservationAction({ id: id(), bikeUnitId: id() }),
    getMoveCandidatesAction: () => getMoveCandidatesAction({ id: id() }),
    planMaintenanceAction: () => planMaintenanceAction({ requestKey: id(), bikeUnitId: id(), firstDay: '2026-07-10', lastDay: '2026-07-10' }),
    updateMaintenanceAction: () => updateMaintenanceAction({ id: id(), firstDay: '2026-07-10', lastDay: '2026-07-10' }),
    getOccupiedRangesAction: () => getOccupiedRangesAction({ bikeUnitId: id() }),
  }

  it('is tested for every exported action, so a new one cannot skip the check', () => {
    expect(Object.keys(calls).sort()).toEqual(Object.keys(actions).sort())
  })

  it.each(Object.keys(calls))('%s', async (name) => {
    vi.mocked(getAdminUser).mockResolvedValue(null as never)
    await expect(calls[name]()).rejects.toThrow('Unauthorized')
    for (const fn of Object.values(reservations)) expect(fn).not.toHaveBeenCalled()
  })
})
