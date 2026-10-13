'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { addClosure, removeClosure, saveWeeklyHours } from '@/lib/shop-schedule-data'
import { validateWeek } from '@/lib/shop-schedule'

/*
 * The shop's opening hours and closures, from the panel. Every action asks first who is calling (a Server Action is a public POST endpoint),
 * then checks its input. The hours are a list of seven days, Monday first, each with its ranges; the data module makes them the weekdays 1..7.
 */

async function requireAdmin() {
  const user = await getAdminUser()
  if (!user) throw new Error('Unauthorized')
}

const time = z.iso.time({ precision: -1 }) // 'HH:MM'
const range = z.object({ opensAt: time, closesAt: time })
const weekInput = z.object({ days: z.array(z.array(range).max(6)).length(7) })

export type SaveHoursResult = { status: 'saved' } | { status: 'invalid'; message: string }

export async function saveOpeningHoursAction(input: unknown): Promise<SaveHoursResult> {
  await requireAdmin()
  const parsed = weekInput.safeParse(input)
  if (!parsed.success) return { status: 'invalid', message: 'Check the times: they are written like 09:00, at most six ranges a day.' }
  const week = Object.fromEntries(parsed.data.days.map((ranges, index) => [index + 1, ranges]))
  const problem = validateWeek(week)
  if (problem) return { status: 'invalid', message: problem }
  await saveWeeklyHours(week)
  revalidatePath('/manage/hours')
  return { status: 'saved' }
}

const closureInput = z.object({
  startsOn: z.iso.date(),
  lastDay: z.iso.date(),
  reason: z.string().trim().max(200).optional(),
}).refine((closure) => closure.lastDay >= closure.startsOn, { message: 'The last day cannot be before the first' })

export type AddClosureResult = { status: 'added' } | { status: 'invalid'; message: string }

export async function addClosureAction(input: unknown): Promise<AddClosureResult> {
  await requireAdmin()
  const parsed = closureInput.safeParse(input)
  if (!parsed.success) return { status: 'invalid', message: parsed.error.issues[0]?.message ?? 'Check the days' }
  const { startsOn, lastDay, reason } = parsed.data
  await addClosure({ startsOn, lastDay, reason: reason ? reason : null })
  revalidatePath('/manage/hours')
  return { status: 'added' }
}

export async function removeClosureAction(id: unknown): Promise<{ status: 'removed' | 'invalid' }> {
  await requireAdmin()
  const parsed = z.uuid().safeParse(id)
  if (!parsed.success) return { status: 'invalid' }
  await removeClosure(parsed.data)
  revalidatePath('/manage/hours')
  return { status: 'removed' }
}
