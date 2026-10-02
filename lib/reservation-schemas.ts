import { z } from 'zod'

// No regex anywhere: zod validates days, ids and the rest.
const day = z.iso.date()
const id = z.uuid()

// Kept out of lib/actions/reservations.ts: a 'use server' file may only export async functions.
export type ActionInvalid = { status: 'invalid'; message: string }

export const createRentalSchema = z.object({
  requestKey: id,
  bikeModelId: id,
  bikeSizeId: id,
  bikeVersionId: id,
  firstDay: day,
  lastDay: day,
  label: z.string().trim().min(1, 'Name is required').max(120, 'Name is too long'),
  confirmDuplicate: z.boolean().default(false),
})

export const planMaintenanceSchema = z.object({
  requestKey: id,
  bikeUnitId: id,
  firstDay: day,
  lastDay: day,
  label: z.string().trim().max(120, 'Reason is too long').optional(),
})

export const updateMaintenanceSchema = z.object({ id, firstDay: day, lastDay: day })
export const reservationIdSchema = z.object({ id })
export const moveReservationSchema = z.object({ id, bikeUnitId: id })
export const occupiedRangesSchema = z.object({ bikeUnitId: id, excludeId: id.optional() })
export const retireBikeSchema = z.object({ id, retiredOn: day })
export const bikeUnitIdSchema = z.object({ id })
