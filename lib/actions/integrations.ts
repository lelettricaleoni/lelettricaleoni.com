'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { isEncryptionConfigured } from '@/lib/integrations/crypto'
import { getIntegrationDefinition } from '@/lib/integrations/registry'
import { canEnable } from '@/lib/integrations/status'
import * as store from '@/lib/integrations/store'
import { createCalendarApi, testConnection } from '@/lib/integrations/google-calendar/client'
import { syncNow } from '@/lib/integrations/google-calendar/sync'
import { parseServiceAccountKey, type ServiceAccountKey } from '@/lib/integrations/google-calendar/key'

/*
 * The panel's integration actions. Every one checks the admin first. None of them ever returns the secret:
 * results carry a status and, at most, the service account e-mail and a message that was written for the
 * person (lib/integrations/google-calendar/client.ts never repeats what Google said).
 */

const GOOGLE_CALENDAR = 'google-calendar'
const MAX_KEY_BYTES = 10_000

async function requireAdmin(): Promise<string> {
  const user = await getAdminUser()
  if (!user) throw new Error('Unauthorized')
  return user.id
}

function refresh() {
  revalidatePath('/manage/integrations', 'layout')
}

export type KeyResult =
  | { status: 'saved'; serviceAccountEmail: string }
  | { status: 'invalid'; message: string }
  | { status: 'no_encryption_key' }

/** The file Google gave (`keyFile`) or its text pasted (`keyText`); the file wins when both are there. */
export async function saveGoogleCalendarKeyAction(formData: FormData): Promise<KeyResult> {
  const adminId = await requireAdmin()
  if (!isEncryptionConfigured()) return { status: 'no_encryption_key' }

  const file = formData.get('keyFile')
  const pasted = formData.get('keyText')
  let text = ''
  if (file instanceof File && file.size > 0) {
    // The size is known before reading: a huge upload is refused without being read at all.
    if (file.size > MAX_KEY_BYTES) return { status: 'invalid', message: 'This file is too big to be a key file (the limit is 10 KB).' }
    text = await file.text()
  } else if (typeof pasted === 'string') {
    text = pasted
  }

  const parsed = parseServiceAccountKey(text)
  if (!parsed.ok) return { status: 'invalid', message: parsed.message }

  await store.saveSecret(GOOGLE_CALENDAR, JSON.stringify(parsed.key), adminId)
  // A new key has not been tested: the integration stays off until it is.
  await store.saveConfig(GOOGLE_CALENDAR, { serviceAccountEmail: parsed.serviceAccountEmail, connectionOk: false, testedCalendarId: null }, adminId)
  await store.setEnabled(GOOGLE_CALENDAR, false, adminId)
  refresh()
  return { status: 'saved', serviceAccountEmail: parsed.serviceAccountEmail }
}

const settingsSchema = z.object({
  calendarId: z.string().trim().min(1, 'Enter the calendar ID.').max(200, 'The calendar ID is too long.')
    .refine((value) => !value.includes(' '), 'A calendar ID has no spaces: copy it again from Google Calendar.'),
  includePhone: z.boolean(),
  includeMaintenance: z.boolean(),
})

export type SettingsResult = { status: 'saved' } | { status: 'invalid'; message: string }

export async function saveGoogleCalendarSettingsAction(input: unknown): Promise<SettingsResult> {
  const adminId = await requireAdmin()
  const parsed = settingsSchema.safeParse(input)
  if (!parsed.success) return { status: 'invalid', message: parsed.error.issues[0]?.message ?? 'Invalid settings.' }

  const current = await store.getIntegrationState(GOOGLE_CALENDAR)
  const changedCalendar = current?.config.calendarId !== parsed.data.calendarId
  await store.saveConfig(GOOGLE_CALENDAR, { ...parsed.data, ...(changedCalendar ? { connectionOk: false } : {}) }, adminId)
  // A different calendar has not been tested: switch off until it is.
  if (changedCalendar && current?.enabled) await store.setEnabled(GOOGLE_CALENDAR, false, adminId)
  refresh()
  return { status: 'saved' }
}

export type TestResult =
  | { status: 'ok'; warning?: string }
  | { status: 'failed'; message: string }
  | { status: 'invalid'; message: string }

export async function testGoogleCalendarAction(): Promise<TestResult> {
  const adminId = await requireAdmin()
  const current = await store.getIntegrationState(GOOGLE_CALENDAR)
  if (!current?.hasSecret) return { status: 'invalid', message: 'Upload the service account key first.' }
  const calendarId = typeof current.config.calendarId === 'string' ? current.config.calendarId.trim() : ''
  if (calendarId === '') return { status: 'invalid', message: 'Enter the calendar ID first.' }

  let key: ServiceAccountKey
  try {
    const secret = await store.getDecryptedSecret(GOOGLE_CALENDAR)
    if (!secret) return { status: 'invalid', message: 'Upload the service account key first.' }
    key = JSON.parse(secret) as ServiceAccountKey
  } catch {
    // Another encryption key than the one that saved it, or damaged data: never a crash, never the details.
    return { status: 'invalid', message: 'The saved key can no longer be read. Upload the key file again.' }
  }

  const result = await testConnection(createCalendarApi(key), calendarId, key.client_email)
  if (result.ok) {
    await store.recordCheck(GOOGLE_CALENDAR, null)
    await store.saveConfig(GOOGLE_CALENDAR, { connectionOk: true, testedCalendarId: calendarId }, adminId)
    refresh()
    return result.warning ? { status: 'ok', warning: result.warning } : { status: 'ok' }
  }
  await store.recordCheck(GOOGLE_CALENDAR, result.message)
  await store.saveConfig(GOOGLE_CALENDAR, { connectionOk: false, testedCalendarId: null }, adminId)
  refresh()
  return { status: 'failed', message: result.message }
}

export type SimpleResult = { status: 'ok' } | { status: 'invalid'; message: string }

const UNKNOWN: SimpleResult = { status: 'invalid', message: 'Unknown integration.' }

export async function enableIntegrationAction(id: string): Promise<SimpleResult> {
  const adminId = await requireAdmin()
  if (!getIntegrationDefinition(id)) return UNKNOWN
  const readiness = canEnable(id, await store.getIntegrationState(id))
  if (!readiness.ok) return { status: 'invalid', message: readiness.message }
  await store.setEnabled(id, true, adminId)
  refresh()
  return { status: 'ok' }
}

export async function disableIntegrationAction(id: string): Promise<SimpleResult> {
  const adminId = await requireAdmin()
  if (!getIntegrationDefinition(id)) return UNKNOWN
  await store.setEnabled(id, false, adminId)
  refresh()
  return { status: 'ok' }
}

export async function removeCredentialsAction(id: string): Promise<SimpleResult> {
  const adminId = await requireAdmin()
  if (!getIntegrationDefinition(id)) return UNKNOWN
  await store.removeSecret(id, adminId)
  await store.saveConfig(id, { serviceAccountEmail: null, connectionOk: false, testedCalendarId: null }, adminId)
  refresh()
  return { status: 'ok' }
}

export type SyncNowActionResult =
  | { status: 'off' }
  | { status: 'done'; upserted: number; removed: number; failed: number; firstError: string | null }

/** The whole calendar brought in line with the bookings (from yesterday to a year ahead). */
export async function syncNowAction(): Promise<SyncNowActionResult> {
  await requireAdmin()
  const result = await syncNow()
  refresh()
  if (result.status === 'off') return { status: 'off' }
  return { status: 'done', ...result.report }
}
