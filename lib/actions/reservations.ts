'use server'
import { getAdminUser } from '@/lib/supabase/server'
import { buildRange, type DayRange } from '@/lib/dates'
import { toCents } from '@/lib/money'
import {
  createRentalSchema, moveReservationSchema, occupiedRangesSchema, planMaintenanceSchema,
  reservationIdSchema, updateMaintenanceSchema, type ActionInvalid,
} from '@/lib/reservation-schemas'
import * as reservations from '@/lib/reservations'

async function requireAdmin() {
  const user = await getAdminUser()
  if (!user) throw new Error('Unauthorized')
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

  return reservations.createCounterRental({
    requestKey: parsed.data.requestKey,
    bikeModelId: parsed.data.bikeModelId,
    bikeSizeId: parsed.data.bikeSizeId,
    bikeVersionId: parsed.data.bikeVersionId,
    startsOn: range.startsOn,
    endsOn: range.endsOn,
    customerId: parsed.data.customerId,
    amountCents: toCents(parsed.data.amount),
    confirmDuplicate: parsed.data.confirmDuplicate,
  })
}

export async function cancelReservationAction(input: unknown): Promise<reservations.CancelResult | ActionInvalid> {
  await requireAdmin()
  const parsed = reservationIdSchema.safeParse(input)
  if (!parsed.success) return invalid('Invalid reservation')
  return reservations.cancelReservation(parsed.data.id)
}

export async function moveReservationAction(input: unknown): Promise<reservations.MoveResult | ActionInvalid> {
  await requireAdmin()
  const parsed = moveReservationSchema.safeParse(input)
  if (!parsed.success) return invalid('Invalid bike')
  return reservations.moveReservation(parsed.data.id, parsed.data.bikeUnitId)
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

  return reservations.planMaintenance({
    requestKey: parsed.data.requestKey,
    bikeUnitId: parsed.data.bikeUnitId,
    startsOn: range.startsOn,
    endsOn: range.endsOn,
    label: parsed.data.label ? parsed.data.label : null,
  })
}

export async function updateMaintenanceAction(input: unknown): Promise<reservations.UpdateMaintenanceResult | ActionInvalid> {
  await requireAdmin()
  const parsed = updateMaintenanceSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? 'Invalid input')
  const range = buildRange(parsed.data.firstDay, parsed.data.lastDay)
  if (!range.ok) return invalid(RANGE_MESSAGES[range.reason])

  return reservations.updateMaintenance(parsed.data.id, range.startsOn, range.endsOn)
}

export async function getOccupiedRangesAction(input: unknown): Promise<DayRange[]> {
  await requireAdmin()
  const parsed = occupiedRangesSchema.safeParse(input)
  return parsed.success ? reservations.getOccupiedRanges(parsed.data.bikeUnitId, parsed.data.excludeId) : []
}
