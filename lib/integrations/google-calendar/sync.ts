import 'server-only'
import { addDaysTo, todayInRome } from '@/lib/dates'
import { getDecryptedSecret, getIntegrationState, recordSync } from '@/lib/integrations/store'
import { explainGoogleError, createSyncApi } from '@/lib/integrations/google-calendar/client'
import {
  getReservationForCalendar, listModelsForLabels, listReservationIdsOfCustomer, listReservationsForCalendar,
} from '@/lib/integrations/google-calendar/data'
import { applyReservation, reconcile, removeReservationEvent, type ReconcileReport, type SyncApi } from '@/lib/integrations/google-calendar/engine'
import type { CalendarSettings } from '@/lib/integrations/google-calendar/events'
import type { ServiceAccountKey } from '@/lib/integrations/google-calendar/key'
import { mergeLabels, wantedLabels } from '@/lib/integrations/google-calendar/labels'

/*
 * What the panel's actions call after a booking changes. Everything here is best effort and NEVER throws: a booking is
 * saved whatever Google does. A failure is written down (the Activity tab shows it) and the next "Sync now" or the daily
 * check puts things right.
 */

const GOOGLE_CALENDAR = 'google-calendar'

interface OpenCalendar {
  api: SyncApi
  settings: CalendarSettings
  describeError: (error: unknown) => string
  /** The email of the service account: what the calendar is shared with. */
  serviceAccount: string
}

/** Null when there is nothing to do: the integration is off or not complete. */
async function openCalendar(): Promise<OpenCalendar | null> {
  const state = await getIntegrationState(GOOGLE_CALENDAR)
  if (!state?.enabled || !state.hasSecret) return null
  const calendarId = typeof state.config.calendarId === 'string' ? state.config.calendarId.trim() : ''
  if (calendarId === '') return null

  let key: ServiceAccountKey
  try {
    const secret = await getDecryptedSecret(GOOGLE_CALENDAR)
    if (!secret) return null
    key = JSON.parse(secret) as ServiceAccountKey
  } catch {
    await recordSync(GOOGLE_CALENDAR, 'The saved key can no longer be read. Upload the key file again.')
    return null
  }

  return {
    api: createSyncApi(key),
    settings: {
      calendarId,
      includePhone: state.config.includePhone === true,
      includeMaintenance: state.config.includeMaintenance !== false,
    },
    describeError: (error) => explainGoogleError(error, key.client_email),
    serviceAccount: key.client_email,
  }
}

function statusOf(error: unknown): number | undefined {
  const details = error as { response?: { status?: unknown }; status?: unknown; code?: unknown }
  return [details?.response?.status, details?.status, details?.code].find((value): value is number => typeof value === 'number')
}

/**
 * The colours of the events. Brings the labels of the calendar in line with the models (one label for each model that has a colour, named like it,
 * and the maintenance one: the labels that are not ours are kept as they are) and, when that works, the events are written with the labels
 * (`settings.labels`). When the service account is not allowed to define labels (it needs owner access to the calendar) or Google refuses for
 * any reason, the events take the nearest of Google's fixed colours instead, and what to do about it is returned, to be written in the Activity
 * tab. Never throws.
 */
async function prepareColours(open: OpenCalendar): Promise<string | null> {
  const { api, settings } = open
  settings.labels = false
  try {
    const existing = await api.readLabels(settings.calendarId)
    const merged = mergeLabels(existing, wantedLabels(await listModelsForLabels()))
    if (merged.tooMany) return "The calendar has too many labels to add the colours of the bikes: they use Google's fixed colours. Delete the labels you do not use in Google Calendar."
    if (merged.changed) await api.writeLabels(settings.calendarId, merged.labels)
    settings.labels = true
    return null
  } catch (error) {
    if (statusOf(error) === 403) {
      return `The bikes use Google's fixed colours. For their own colours, share the calendar with ${open.serviceAccount} with the permission "Make changes and manage sharing".`
    }
    return `The bikes use Google's fixed colours for now: ${open.describeError(error)}`
  }
}

/** Runs `work` on the open calendar and writes down how it went. Swallows everything. */
async function guarded(work: (open: OpenCalendar) => Promise<void>): Promise<void> {
  try {
    const open = await openCalendar()
    if (!open) return
    try {
      const colourWarning = await prepareColours(open)
      await work(open)
      await recordSync(GOOGLE_CALENDAR, colourWarning)
    } catch (error) {
      await recordSync(GOOGLE_CALENDAR, open.describeError(error))
    }
  } catch {
    // The database itself failed: nothing more can be written down, and the booking must not suffer for it.
  }
}

/** Makes the calendar match one reservation: created, updated, or removed (cancelled, or not there any more). */
export async function syncReservation(reservationId: string): Promise<void> {
  await guarded(async ({ api, settings }) => {
    const reservation = await getReservationForCalendar(reservationId)
    if (reservation) await applyReservation(api, settings, reservation)
    else await removeReservationEvent(api, settings, reservationId)
  })
}

/** A model was saved (its colour or its name may have changed): its label in the calendar follows. The events that use it change colour by themselves. */
export async function syncModelLabels(): Promise<void> {
  await guarded(async () => {})
}

/** The events show the customer's name and phone, so an edit of the customer is sent again for their coming bookings. */
export async function syncCustomerReservations(customerId: string): Promise<void> {
  await guarded(async ({ api, settings }) => {
    for (const id of await listReservationIdsOfCustomer(customerId)) {
      const reservation = await getReservationForCalendar(id)
      if (reservation) await applyReservation(api, settings, reservation)
    }
  })
}

export type SyncNowResult = { status: 'off' } | { status: 'done'; report: ReconcileReport }

/** From yesterday to a year ahead, the whole calendar brought in line. For the "Sync now" button and the daily check. */
export async function syncNow(): Promise<SyncNowResult> {
  const open = await openCalendar()
  if (!open) return { status: 'off' }

  const from = addDaysTo(todayInRome(), -1)
  const to = addDaysTo(todayInRome(), 366)
  const colourWarning = await prepareColours(open)
  const report = await reconcile(open.api, open.settings, await listReservationsForCalendar(from, to), { from, to }, open.describeError)
  await recordSync(GOOGLE_CALENDAR, report.firstError ?? colourWarning)
  return { status: 'done', report }
}
