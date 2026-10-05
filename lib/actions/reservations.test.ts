import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ getAdminUser: vi.fn() }))
// `after` runs once the response is sent: here it only collects what was scheduled, so a test can see that the
// action itself did not wait for Google, and then run it.
const scheduled: Array<() => unknown> = []
vi.mock('next/server', () => ({ after: (work: () => unknown) => { scheduled.push(work) } }))
vi.mock('@/lib/integrations/google-calendar/sync', () => ({ syncReservation: vi.fn() }))
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
import { syncReservation } from '@/lib/integrations/google-calendar/sync'
import * as actions from './reservations'
import {
  cancelReservationAction, createRentalAction, getMoveCandidatesAction, getOccupiedRangesAction,
  moveReservationAction, planMaintenanceAction, updateMaintenanceAction,
} from './reservations'

const id = () => crypto.randomUUID()
const CUSTOMER = id()
const rentalInput = () => ({
  requestKey: id(), bikeModelId: id(), bikeSizeId: id(), bikeVersionId: id(),
  firstDay: '2026-07-10', lastDay: '2026-07-12', customerId: CUSTOMER, amount: 45.5,
})

beforeEach(() => {
  vi.resetAllMocks()
  scheduled.length = 0
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
      expect.objectContaining({ startsOn: '2026-07-10', endsOn: '2026-07-13', customerId: CUSTOMER, confirmDuplicate: false }),
    )
  })

  it('stores the amount in cents, rounded, never as a float of euros', async () => {
    vi.mocked(reservations.createCounterRental).mockResolvedValue({ status: 'no_bike_free' })
    await createRentalAction({ ...rentalInput(), amount: 45.5 })
    await createRentalAction({ ...rentalInput(), amount: 0.1 + 0.2 })
    expect(vi.mocked(reservations.createCounterRental).mock.calls.map(([input]) => input.amountCents)).toEqual([4550, 30])
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

describe('the Google Calendar sync after a booking changes', () => {
  const runScheduled = async () => { for (const work of scheduled.splice(0)) await work() }

  it('is scheduled after a rental is created, and is not waited for by the action', async () => {
    const reservationId = id()
    vi.mocked(reservations.createCounterRental).mockResolvedValue({ status: 'created', reservationId, bikeUnitId: id(), replayed: false })
    await createRentalAction(rentalInput())
    expect(scheduled).toHaveLength(1)
    expect(syncReservation).not.toHaveBeenCalled()
    await runScheduled()
    expect(syncReservation).toHaveBeenCalledWith(reservationId)
  })

  it('is not scheduled when nothing was created', async () => {
    vi.mocked(reservations.createCounterRental).mockResolvedValue({ status: 'no_bike_free' })
    await createRentalAction(rentalInput())
    expect(scheduled).toHaveLength(0)
  })

  it('is scheduled after a cancellation, so the event goes', async () => {
    const reservationId = id()
    vi.mocked(reservations.cancelReservation).mockResolvedValue({ status: 'cancelled' })
    await cancelReservationAction({ id: reservationId })
    await runScheduled()
    expect(syncReservation).toHaveBeenCalledWith(reservationId)
  })

  it('is not scheduled for a cancellation that did not happen', async () => {
    vi.mocked(reservations.cancelReservation).mockResolvedValue({ status: 'not_found' })
    await cancelReservationAction({ id: id() })
    expect(scheduled).toHaveLength(0)
  })

  it('is scheduled after a move (the bike is in the title), not after a refused one', async () => {
    const reservationId = id()
    vi.mocked(reservations.moveReservation).mockResolvedValue({ status: 'moved' })
    await moveReservationAction({ id: reservationId, bikeUnitId: id() })
    await runScheduled()
    expect(syncReservation).toHaveBeenCalledWith(reservationId)

    vi.mocked(reservations.moveReservation).mockResolvedValue({ status: 'conflict' })
    await moveReservationAction({ id: reservationId, bikeUnitId: id() })
    expect(scheduled).toHaveLength(0)
  })

  it('is scheduled after a maintenance is planned or its days change, not after a conflict', async () => {
    const reservationId = id()
    vi.mocked(reservations.planMaintenance).mockResolvedValue({ status: 'planned', reservationId, replayed: false })
    await planMaintenanceAction({ requestKey: id(), bikeUnitId: id(), firstDay: '2026-07-10', lastDay: '2026-07-12' })
    vi.mocked(reservations.updateMaintenance).mockResolvedValue({ status: 'updated' })
    const otherId = id()
    await updateMaintenanceAction({ id: otherId, firstDay: '2026-07-10', lastDay: '2026-07-12' })
    await runScheduled()
    expect(vi.mocked(syncReservation).mock.calls.map(([argument]) => argument)).toEqual([reservationId, otherId])

    vi.mocked(reservations.planMaintenance).mockResolvedValue({ status: 'conflict', conflicts: [] })
    await planMaintenanceAction({ requestKey: id(), bikeUnitId: id(), firstDay: '2026-07-10', lastDay: '2026-07-12' })
    expect(scheduled).toHaveLength(0)
  })
})
