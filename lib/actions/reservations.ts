'use server'
import { after } from 'next/server'
import { getAdminUser } from '@/lib/supabase/server'
import { buildRange, type DayRange } from '@/lib/dates'
import { toCents } from '@/lib/money'
import {
  cancelOnlineSchema, createRentalSchema, moveReservationSchema, occupiedRangesSchema, planMaintenanceSchema,
  reservationIdSchema, updateMaintenanceSchema, type ActionInvalid,
} from '@/lib/reservation-schemas'
import * as reservations from '@/lib/reservations'
import { cancelOnlineReservation, type CancelOnlineResult } from '@/lib/booking/refunds'
import { PaymentsNotConfiguredError } from '@/lib/booking/payments'
import { syncReservation } from '@/lib/integrations/google-calendar/sync'

async function requireAdmin() {
  const user = await getAdminUser()
  if (!user) throw new Error('Unauthorized')
}

/**
 * Sends the booking to Google Calendar (when that integration is on) AFTER the response: whoever uses the panel does not
 * wait for Google, and a failure there can never undo or delay a booking (lib/integrations/google-calendar/sync.ts
 * never throws and writes the problem in the Activity tab).
 */
function scheduleCalendarSync(reservationId: string) {
  after(() => syncReservation(reservationId))
}

function invalid(message: string): ActionInvalid {
  return { status: 'invalid', message }
}

const RANGE_MESSAGES = {
  invalid_day: 'That is not a valid date',
  end_before_start: 'The last day cannot be before the first day',
} as const

export async function createRentalAction(input: unknown): Promise<reservations.CreateRentalResult | ActionInvalid> {
  await requireAdmin()
  const parsed = createRentalSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? 'Invalid input')
  const range = buildRange(parsed.data.firstDay, parsed.data.lastDay)
  if (!range.ok) return invalid(RANGE_MESSAGES[range.reason])

  const result = await reservations.createCounterRental({
    requestKey: parsed.data.requestKey,
    bikeModelId: parsed.data.bikeModelId,
    bikeSizeId: parsed.data.bikeSizeId,
    bikeVersionId: parsed.data.bikeVersionId,
    startsOn: range.startsOn,
    endsOn: range.endsOn,
    customerId: parsed.data.customerId,
    bikeUnitId: parsed.data.bikeUnitId,
    amountCents: toCents(parsed.data.amount),
    confirmDuplicate: parsed.data.confirmDuplicate,
  })
  if (result.status === 'created') scheduleCalendarSync(result.reservationId)
  return result
}

export async function cancelReservationAction(input: unknown): Promise<reservations.CancelResult | ActionInvalid> {
  await requireAdmin()
  const parsed = reservationIdSchema.safeParse(input)
  if (!parsed.success) return invalid('Invalid reservation')
  const result = await reservations.cancelReservation(parsed.data.id)
  if (result.status === 'cancelled') scheduleCalendarSync(parsed.data.id)
  return result
}

/**
 * Cancels a bike booked online and gives back all of what it cost, part of it, or nothing (maintenance of the shop's choice, bad weather,
 * an agreement with the customer). Unlike the customer, staff can do it at any time; the refund is recorded as theirs.
 */
export async function cancelOnlineAction(input: unknown): Promise<CancelOnlineResult | ActionInvalid> {
  const admin = await getAdminUser()
  if (!admin) throw new Error('Unauthorized')
  const parsed = cancelOnlineSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? 'Invalid reservation')
  const refundCents = parsed.data.refund === 'full' ? undefined : parsed.data.refund === 'none' ? 0 : toCents(parsed.data.amount)
  try {
    const result = await cancelOnlineReservation({ reservationId: parsed.data.id, actor: { kind: 'staff', userId: admin.id }, refundCents })
    if (result.status === 'cancelled') scheduleCalendarSync(parsed.data.id)
    return result
  } catch (error) {
    if (error instanceof PaymentsNotConfiguredError) return invalid('Online payments are not available on this site')
    throw error
  }
}

export async function moveReservationAction(input: unknown): Promise<reservations.MoveResult | ActionInvalid> {
  await requireAdmin()
  const parsed = moveReservationSchema.safeParse(input)
  if (!parsed.success) return invalid('Invalid bike')
  const result = await reservations.moveReservation(parsed.data.id, parsed.data.bikeUnitId)
  if (result.status === 'moved') scheduleCalendarSync(parsed.data.id)
  return result
}

export async function getMoveCandidatesAction(input: unknown): Promise<reservations.MoveCandidate[]> {
  await requireAdmin()
  const parsed = reservationIdSchema.safeParse(input)
  return parsed.success ? reservations.getMoveCandidates(parsed.data.id) : []
}

export async function planMaintenanceAction(input: unknown): Promise<reservations.MaintenanceResult | ActionInvalid> {
  await requireAdmin()
  const parsed = planMaintenanceSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? 'Invalid input')
  const range = buildRange(parsed.data.firstDay, parsed.data.lastDay)
  if (!range.ok) return invalid(RANGE_MESSAGES[range.reason])

  const result = await reservations.planMaintenance({
    requestKey: parsed.data.requestKey,
    bikeUnitId: parsed.data.bikeUnitId,
    startsOn: range.startsOn,
    endsOn: range.endsOn,
    label: parsed.data.label ? parsed.data.label : null,
  })
  if (result.status === 'planned') scheduleCalendarSync(result.reservationId)
  return result
}

export async function updateMaintenanceAction(input: unknown): Promise<reservations.UpdateMaintenanceResult | ActionInvalid> {
  await requireAdmin()
  const parsed = updateMaintenanceSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? 'Invalid input')
  const range = buildRange(parsed.data.firstDay, parsed.data.lastDay)
  if (!range.ok) return invalid(RANGE_MESSAGES[range.reason])

  const result = await reservations.updateMaintenance(parsed.data.id, range.startsOn, range.endsOn)
  if (result.status === 'updated') scheduleCalendarSync(parsed.data.id)
  return result
}

export async function getOccupiedRangesAction(input: unknown): Promise<DayRange[]> {
  await requireAdmin()
  const parsed = occupiedRangesSchema.safeParse(input)
  return parsed.success ? reservations.getOccupiedRanges(parsed.data.bikeUnitId, parsed.data.excludeId) : []
}
