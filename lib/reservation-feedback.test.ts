import { describe, it, expect } from 'vitest'
import {
  rentalFeedback, cancelFeedback, moveFeedback, maintenancePlanFeedback, maintenanceUpdateFeedback, deleteBikeFeedback,
  retireFeedback, restoreFeedback,
} from './reservation-feedback'

const existing = { id: 'r1', bikeUnitId: 'u1', kind: 'counter_rental' as const, startsOn: '2031-07-10', endsOn: '2031-07-13', label: 'Rossi' }

describe('rentalFeedback', () => {
  it('says a rental was added, or that it had already been saved when the key was repeated', () => {
    expect(rentalFeedback({ status: 'created', reservationId: 'r', bikeUnitId: 'u', replayed: false }))
      .toEqual({ tone: 'success', message: 'Rental added' })
    expect(rentalFeedback({ status: 'created', reservationId: 'r', bikeUnitId: 'u', replayed: true }))
      .toEqual({ tone: 'success', message: 'This rental was already saved' })
  })

  it('asks for confirmation on a possible duplicate, with the rental that looks the same', () => {
    expect(rentalFeedback({ status: 'possible_duplicate', existing })).toEqual({ tone: 'confirm-duplicate', existing })
  })

  it('explains why nothing was created', () => {
    expect(rentalFeedback({ status: 'no_bike_free' })).toEqual({ tone: 'error', message: 'No bike of this kind is free on these days' })
    expect(rentalFeedback({ status: 'no_bike_free' }, { specificBike: true })).toEqual({ tone: 'error', message: 'This bike is not free on these days' })
    expect(rentalFeedback({ status: 'try_again' })).toEqual({ tone: 'error', message: 'Too many requests at once. Try again' })
    expect(rentalFeedback({ status: 'invalid', message: 'Name is required' })).toEqual({ tone: 'error', message: 'Name is required' })
  })
})

describe('a dialog left open on a reservation someone else changed', () => {
  it('is told so, and asked to close, instead of an error', () => {
    const stale = { tone: 'stale', message: 'This was already changed or removed' }
    expect(cancelFeedback({ status: 'not_found' }, 'rental')).toEqual(stale)
    expect(moveFeedback({ status: 'not_found' })).toEqual(stale)
    expect(maintenanceUpdateFeedback({ status: 'not_found' })).toEqual(stale)
  })
})

describe('cancelFeedback', () => {
  it('names what was cancelled', () => {
    expect(cancelFeedback({ status: 'cancelled' }, 'rental')).toEqual({ tone: 'success', message: 'Rental cancelled' })
    expect(cancelFeedback({ status: 'cancelled' }, 'maintenance')).toEqual({ tone: 'success', message: 'Maintenance cancelled' })
  })
})

describe('moveFeedback', () => {
  it('reports a move, a bike taken a moment ago, and a bike that is gone', () => {
    expect(moveFeedback({ status: 'moved' })).toEqual({ tone: 'success', message: 'Rental moved' })
    expect(moveFeedback({ status: 'conflict' })).toEqual({ tone: 'error', message: 'That bike was just taken for these days' })
    expect(moveFeedback({ status: 'unknown_bike' })).toEqual({ tone: 'error', message: 'That bike no longer exists' })
  })
})

describe('maintenance feedback', () => {
  it('reports a planned block', () => {
    expect(maintenancePlanFeedback({ status: 'planned', reservationId: 'm', replayed: false }))
      .toEqual({ tone: 'success', message: 'Maintenance planned' })
  })

  it('lists the rentals in the way, with their last day included', () => {
    const feedback = maintenancePlanFeedback({ status: 'conflict', conflicts: [existing] })
    expect(feedback).toEqual({
      tone: 'error',
      message: 'Already booked: Rossi (2031-07-10 to 2031-07-12). Move those rentals first.',
    })
  })

  it('does not invent a list when there is none', () => {
    expect(maintenancePlanFeedback({ status: 'conflict', conflicts: [] }))
      .toEqual({ tone: 'error', message: 'Those days are no longer free' })
  })

  it('calls an unnamed block maintenance in that list', () => {
    const feedback = maintenancePlanFeedback({ status: 'conflict', conflicts: [{ ...existing, kind: 'maintenance', label: null }] })
    expect(feedback.tone === 'error' && feedback.message).toContain('maintenance (2031-07-10 to 2031-07-12)')
  })

  it('reports an update, a clash, and a bike that is gone', () => {
    expect(maintenanceUpdateFeedback({ status: 'updated' })).toEqual({ tone: 'success', message: 'Maintenance updated' })
    expect(maintenanceUpdateFeedback({ status: 'conflict', conflicts: [existing] }).tone).toBe('error')
    expect(maintenancePlanFeedback({ status: 'unknown_bike' })).toEqual({ tone: 'error', message: 'This bike no longer exists' })
  })
})

describe('deleteBikeFeedback', () => {
  it('confirms a bike removed from the shop', () => {
    expect(deleteBikeFeedback({ ok: true })).toEqual({ tone: 'success', message: 'Bike removed from the shop' })
  })

  it('explains that a bike with reservations, even cancelled ones, stays', () => {
    expect(deleteBikeFeedback({ ok: false, reason: 'has_reservations' })).toEqual({
      tone: 'error',
      message: 'This bike has reservations, even cancelled ones, so it cannot be removed',
    })
  })
})

describe('retiring and restoring a bike', () => {
  it('says from which day the bike is retired', () => {
    expect(retireFeedback({ status: 'retired' }, '2031-10-15')).toEqual({ tone: 'success', message: 'Bike retired from 2031-10-15' })
  })

  it('lists the rentals that still reach that day, last day included', () => {
    expect(retireFeedback({ status: 'conflict', conflicts: [existing] }, '2031-07-11')).toEqual({
      tone: 'error',
      message: 'Still booked: Rossi (2031-07-10 to 2031-07-12). Move those rentals first.',
    })
  })

  it('does not invent a list when there is none, and calls a missing bike stale', () => {
    expect(retireFeedback({ status: 'conflict', conflicts: [] }, '2031-07-11').tone).toBe('error')
    expect(retireFeedback({ status: 'not_found' }, '2031-07-11')).toEqual({ tone: 'stale', message: 'This was already changed or removed' })
  })

  it('reports a restore, and a bike that is gone', () => {
    expect(restoreFeedback({ status: 'restored' })).toEqual({ tone: 'success', message: 'Bike back in service' })
    expect(restoreFeedback({ status: 'not_found' })).toEqual({ tone: 'stale', message: 'This was already changed or removed' })
  })

  it('does not mistake a validation problem for a bike that is gone', () => {
    expect(restoreFeedback({ status: 'invalid', message: 'Invalid bike' })).toEqual({ tone: 'error', message: 'Invalid bike' })
  })

  it('passes a validation message through', () => {
    expect(retireFeedback({ status: 'invalid', message: 'That is not a valid date' }, '2031-07-11'))
      .toEqual({ tone: 'error', message: 'That is not a valid date' })
  })
})
