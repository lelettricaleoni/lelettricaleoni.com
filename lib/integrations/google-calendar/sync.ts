import 'server-only'
import { addDaysTo, todayInRome } from '@/lib/dates'
import { getDecryptedSecret, getIntegrationState, recordSync } from '@/lib/integrations/store'
import { explainGoogleError, createSyncApi } from '@/lib/integrations/google-calendar/client'
import {
  getReservationForCalendar, listReservationIdsOfCustomer, listReservationsForCalendar,
} from '@/lib/integrations/google-calendar/data'
import { applyReservation, reconcile, removeReservationEvent, type ReconcileReport, type SyncApi } from '@/lib/integrations/google-calendar/engine'
import type { CalendarSettings } from '@/lib/integrations/google-calendar/events'
import type { ServiceAccountKey } from '@/lib/integrations/google-calendar/key'

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
  }
}

/** Runs `work` on the open calendar and writes down how it went. Swallows everything. */
async function guarded(work: (open: OpenCalendar) => Promise<void>): Promise<void> {
  try {
    const open = await openCalendar()
    if (!open) return
    try {
      await work(open)
      await recordSync(GOOGLE_CALENDAR, null)
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
  const report = await reconcile(open.api, open.settings, await listReservationsForCalendar(from, to), { from, to }, open.describeError)
  await recordSync(GOOGLE_CALENDAR, report.firstError)
  return { status: 'done', report }
}
