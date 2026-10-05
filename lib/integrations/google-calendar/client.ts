import { auth as googleAuth, calendar as createCalendar } from '@googleapis/calendar'
import { exclusiveEnd, todayInRome } from '@/lib/dates'
import type { ServiceAccountKey } from './key'

/*
 * The only file that talks to Google Calendar. The rest of the app depends on the small `CalendarApi` below,
 * so it can be tested without Google and so the real client can be swapped. Scope: events only (the least
 * that lets it create and remove events).
 */

export interface CalendarApi {
  /** Reads one event of the calendar: proves the service account can see it. */
  readEvents(calendarId: string): Promise<void>
  /** Creates a marked all-day test event and returns its id: proves it can write. */
  createTestEvent(calendarId: string): Promise<string>
  deleteEvent(calendarId: string, eventId: string): Promise<void>
}

export function createCalendarApi(key: ServiceAccountKey): CalendarApi {
  const auth = new googleAuth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ['https://www.googleapis.com/auth/calendar.events'],
  })
  const calendar = createCalendar({ version: 'v3', auth })

  return {
    async readEvents(calendarId) {
      await calendar.events.list({ calendarId, maxResults: 1 })
    },
    async createTestEvent(calendarId) {
      const today = todayInRome()
      const { data } = await calendar.events.insert({
        calendarId,
        requestBody: {
          summary: 'Lelettrica: connection test (safe to delete)',
          start: { date: today },
          end: { date: exclusiveEnd(today) },
          extendedProperties: { private: { lelettricaConnectionTest: 'true' } },
        },
      })
      if (!data.id) throw new Error('Google created the event without an id')
      return data.id
    },
    async deleteEvent(calendarId, eventId) {
      await calendar.events.delete({ calendarId, eventId })
    },
  }
}

interface GoogleErrorDetails {
  status?: number
  reason?: string
  oauthError?: string
  networkCode?: string
  message: string
}

function details(error: unknown): GoogleErrorDetails | null {
  if (typeof error !== 'object' || error === null) return null
  const e = error as {
    message?: unknown; code?: unknown; status?: unknown
    response?: { status?: unknown; data?: { error?: unknown } }
  }
  const data = e.response?.data?.error
  const status = [e.response?.status, e.status, e.code].find((value): value is number => typeof value === 'number')
  const errors = typeof data === 'object' && data !== null ? (data as { errors?: { reason?: unknown }[] }).errors : undefined
  return {
    status,
    reason: typeof errors?.[0]?.reason === 'string' ? errors[0].reason : undefined,
    oauthError: typeof data === 'string' ? data : undefined,
    networkCode: typeof e.code === 'string' ? e.code : undefined,
    message: typeof e.message === 'string' ? e.message : '',
  }
}

const NETWORK_CODES = new Set(['ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN'])
const REJECTED_KEY = new Set(['invalid_grant', 'invalid_client', 'unauthorized_client'])
const READ_ONLY_REASONS = new Set(['forbidden', 'writeAccessRequired', 'requiredAccessLevel', 'insufficientPermissions', 'forbiddenForServiceAccounts'])

/**
 * A message the person can act on. It NEVER repeats what Google said (it can contain project numbers or parts
 * of the credentials): only the cause we recognise, or the HTTP status.
 */
export function explainGoogleError(error: unknown, serviceAccountEmail: string): string {
  const d = details(error)
  if (!d) return 'Something unexpected went wrong. Try again.'

  if (d.networkCode && NETWORK_CODES.has(d.networkCode)) return 'Could not reach Google. Check the connection and try again.'
  if (d.status === 401 || (d.oauthError && REJECTED_KEY.has(d.oauthError)) || d.message.includes('invalid_grant')) {
    return 'Google rejected this key. It may have been deleted or disabled: create a new key for the service account and upload it again.'
  }
  if (d.reason === 'accessNotConfigured' || d.message.includes('has not been used in project')) {
    return 'The Google Calendar API is not enabled for this project. Enable it in Google Cloud (step 2 of the guide), wait a minute and try again.'
  }
  if (d.status === 404 || d.reason === 'notFound') {
    return `Google cannot find this calendar. Check the calendar ID, and that the calendar is shared with ${serviceAccountEmail}.`
  }
  if (d.status === 403 && (!d.reason || READ_ONLY_REASONS.has(d.reason))) {
    return 'The service account can reach the calendar but is not allowed to change it. Share the calendar with the permission "Make changes to events".'
  }
  return `Google answered with an error${d.status ? ` (HTTP ${d.status})` : ''}. Try again; if it keeps happening, check the Activity tab.`
}

export type ConnectionResult = { ok: true; warning?: string } | { ok: false; message: string }

/** Reads the calendar, writes a test event, removes it. Stops at the first thing that fails. */
export async function testConnection(api: CalendarApi, calendarId: string, serviceAccountEmail: string): Promise<ConnectionResult> {
  const id = calendarId.trim()
  if (id === '') return { ok: false, message: 'Enter the calendar ID first.' }

  let eventId: string
  try {
    await api.readEvents(id)
    eventId = await api.createTestEvent(id)
  } catch (error) {
    return { ok: false, message: explainGoogleError(error, serviceAccountEmail) }
  }

  try {
    await api.deleteEvent(id, eventId)
  } catch {
    return {
      ok: true,
      warning: 'The connection works, but the test event could not be removed. Delete "Lelettrica: connection test" from the calendar by hand.',
    }
  }
  return { ok: true }
}
