import { eventIdFor, wantedEvent, type CalendarEvent, type CalendarSettings, type ReservationForCalendar } from '@/lib/integrations/google-calendar/events'
import type { IsoDate } from '@/lib/dates'

/*
 * The sync logic, with no network of its own: it talks to Google through `SyncApi`, so it is tested against a
 * calendar in memory. One direction only (the panel -> Google). Every step is idempotent: the event id comes
 * from the reservation id, so doing it twice, or after a failure, never makes a double.
 */

export interface SyncApi {
  /** Creates the event, or updates it (also bringing back one that was deleted: Google allows it). */
  upsertEvent(calendarId: string, eventId: string, event: CalendarEvent): Promise<'created' | 'updated'>
  /** "absent" when there was nothing to remove (Google says 404 or 410): that is a success. */
  removeEvent(calendarId: string, eventId: string): Promise<'removed' | 'absent'>
  /** The ids of OUR events (marked as managed) in the window: events added by hand are never listed. */
  listManagedEventIds(calendarId: string, from: IsoDate, to: IsoDate): Promise<string[]>
}

export type ApplyResult = 'created' | 'updated' | 'removed' | 'absent'

/** Makes the calendar match one reservation: the event exists, is up to date, or is gone. */
export async function applyReservation(api: SyncApi, settings: CalendarSettings, reservation: ReservationForCalendar): Promise<ApplyResult> {
  const event = wantedEvent(reservation, settings)
  const eventId = eventIdFor(reservation.id)
  return event ? api.upsertEvent(settings.calendarId, eventId, event) : api.removeEvent(settings.calendarId, eventId)
}

/** For a reservation that is not in the database any more. */
export async function removeReservationEvent(api: SyncApi, settings: CalendarSettings, reservationId: string): Promise<'removed' | 'absent'> {
  return api.removeEvent(settings.calendarId, eventIdFor(reservationId))
}

export interface ReconcileReport {
  upserted: number
  removed: number
  failed: number
  firstError: string | null
}

/**
 * The whole window, brought in line: every reservation applied, then the events of OURS that match no
 * reservation removed (one cancelled while Google was down, a bike deleted). If Google cannot even be read
 * nothing is removed: without the list there is nothing to compare, and guessing would delete real events.
 */
export async function reconcile(
  api: SyncApi,
  settings: CalendarSettings,
  reservations: ReservationForCalendar[],
  window: { from: IsoDate; to: IsoDate },
  describeError: (error: unknown) => string,
): Promise<ReconcileReport> {
  const report: ReconcileReport = { upserted: 0, removed: 0, failed: 0, firstError: null }
  const fail = (error: unknown) => {
    report.failed += 1
    report.firstError ??= describeError(error)
  }

  const wantedIds = new Set<string>()
  for (const reservation of reservations) {
    if (wantedEvent(reservation, settings)) wantedIds.add(eventIdFor(reservation.id))
    try {
      const result = await applyReservation(api, settings, reservation)
      if (result === 'created' || result === 'updated') report.upserted += 1
      else if (result === 'removed') report.removed += 1
    } catch (error) {
      fail(error)
    }
  }

  let existing: string[]
  try {
    existing = await api.listManagedEventIds(settings.calendarId, window.from, window.to)
  } catch (error) {
    fail(error)
    return report
  }
  for (const eventId of existing) {
    if (wantedIds.has(eventId)) continue
    try {
      if ((await api.removeEvent(settings.calendarId, eventId)) === 'removed') report.removed += 1
    } catch (error) {
      fail(error)
    }
  }
  return report
}
