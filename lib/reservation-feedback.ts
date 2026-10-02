import { inclusiveEnd } from '@/lib/dates'
import type { ActionInvalid } from '@/lib/reservation-schemas'
import type {
  CancelResult, CreateRentalResult, MaintenanceResult, MoveResult, ReservationSummary, RestoreResult,
  RetireResult, UpdateMaintenanceResult,
} from '@/lib/reservations'

/**
 * What the panel tells the person after an action, in one place so it can be tested.
 * `stale` is a reservation another tab or another person had already changed or removed:
 * the dialog that was open on it should close, not show an error.
 */
export type Feedback =
  | { tone: 'success'; message: string }
  | { tone: 'error'; message: string }
  | { tone: 'stale'; message: string }
  | { tone: 'confirm-duplicate'; existing: ReservationSummary }

const STALE = 'This was already changed or removed'

export function rentalFeedback(result: CreateRentalResult | ActionInvalid): Feedback {
  switch (result.status) {
    case 'created':
      return { tone: 'success', message: result.replayed ? 'This rental was already saved' : 'Rental added' }
    case 'possible_duplicate':
      return { tone: 'confirm-duplicate', existing: result.existing }
    case 'no_bike_free':
      return { tone: 'error', message: 'No bike of this kind is free on these days' }
    case 'try_again':
      return { tone: 'error', message: 'Too many requests at once. Try again' }
    case 'invalid':
      return { tone: 'error', message: result.message }
  }
}

export function cancelFeedback(result: CancelResult | ActionInvalid, what: 'rental' | 'maintenance'): Feedback {
  switch (result.status) {
    case 'cancelled':
      return { tone: 'success', message: what === 'rental' ? 'Rental cancelled' : 'Maintenance cancelled' }
    case 'not_found':
      return { tone: 'stale', message: STALE }
    case 'invalid':
      return { tone: 'error', message: result.message }
  }
}

export function moveFeedback(result: MoveResult | ActionInvalid): Feedback {
  switch (result.status) {
    case 'moved':
      return { tone: 'success', message: 'Rental moved' }
    case 'conflict':
      return { tone: 'error', message: 'That bike was just taken for these days' }
    case 'unknown_bike':
      return { tone: 'error', message: 'That bike no longer exists' }
    case 'not_found':
      return { tone: 'stale', message: STALE }
    case 'invalid':
      return { tone: 'error', message: result.message }
  }
}

function conflictList(conflicts: ReservationSummary[]): string {
  return conflicts
    .map((c) => `${c.label ?? 'maintenance'} (${c.startsOn} to ${inclusiveEnd(c.endsOn)})`)
    .join(', ')
}

export function maintenancePlanFeedback(result: MaintenanceResult | ActionInvalid): Feedback {
  switch (result.status) {
    case 'planned':
      return { tone: 'success', message: 'Maintenance planned' }
    case 'conflict':
      return {
        tone: 'error',
        message: result.conflicts.length > 0
          ? `Already booked: ${conflictList(result.conflicts)}. Move those rentals first.`
          : 'Those days are no longer free',
      }
    case 'unknown_bike':
      return { tone: 'error', message: 'This bike no longer exists' }
    case 'invalid':
      return { tone: 'error', message: result.message }
  }
}

export function maintenanceUpdateFeedback(result: UpdateMaintenanceResult | ActionInvalid): Feedback {
  switch (result.status) {
    case 'updated':
      return { tone: 'success', message: 'Maintenance updated' }
    case 'conflict':
      return {
        tone: 'error',
        message: result.conflicts.length > 0
          ? `Already booked: ${conflictList(result.conflicts)}. Move those rentals first.`
          : 'Some of those days are already booked. Move those rentals first.',
      }
    case 'not_found':
      return { tone: 'stale', message: STALE }
    case 'invalid':
      return { tone: 'error', message: result.message }
  }
}

export function deleteBikeFeedback(result: { ok: true } | { ok: false; reason: 'has_reservations' }): Feedback {
  return result.ok
    ? { tone: 'success', message: 'Bike removed from the shop' }
    : { tone: 'error', message: 'This bike has reservations, even cancelled ones, so it cannot be removed' }
}

export function retireFeedback(result: RetireResult | ActionInvalid, retiredOn: string): Feedback {
  switch (result.status) {
    case 'retired':
      return { tone: 'success', message: `Bike retired from ${retiredOn}` }
    case 'conflict':
      return {
        tone: 'error',
        message: result.conflicts.length > 0
          ? `Still booked: ${conflictList(result.conflicts)}. Move those rentals first.`
          : 'That bike is still booked on or after that day',
      }
    case 'not_found':
      return { tone: 'stale', message: STALE }
    case 'invalid':
      return { tone: 'error', message: result.message }
  }
}

export function restoreFeedback(result: RestoreResult | ActionInvalid): Feedback {
  switch (result.status) {
    case 'restored':
      return { tone: 'success', message: 'Bike back in service' }
    case 'not_found':
      return { tone: 'stale', message: STALE }
    case 'invalid':
      return { tone: 'error', message: result.message }
  }
}
