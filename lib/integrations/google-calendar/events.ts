import { daysBetween, inclusiveEnd, type IsoDate } from '@/lib/dates'

/*
 * What a reservation looks like as a Google Calendar event. Pure: no network, no database. The event is built
 * from `ReservationForCalendar`, which does NOT carry the amount or the private notes of the customer, so they
 * cannot end up in Google by mistake.
 */

export interface CalendarSettings {
  calendarId: string
  includePhone: boolean
  includeMaintenance: boolean
}

export interface ReservationForCalendar {
  id: string
  kind: 'counter_rental' | 'maintenance' | 'online_rental'
  /** Only `confirmed` has an event: `held` is not paid yet, `expired` never was, `cancelled` is over. */
  status: 'confirmed' | 'held' | 'expired' | 'cancelled'
  startsOn: IsoDate
  /** Exclusive: the day the bike is back. Google's all-day events end the same way. */
  endsOn: IsoDate
  /** "Mondraker Arid S · M · Alu" */
  bikeLabel: string
  shortId: string
  customerName: string | null
  customerPhone: string | null
  /** The reason of a maintenance. */
  label: string | null
}

export interface CalendarEvent {
  summary: string
  description: string
  start: { date: IsoDate }
  end: { date: IsoDate }
  colorId?: string
  reminders: { useDefault: false }
  extendedProperties: { private: { lelettricaManaged: 'true'; reservationId: string } }
}

/** Google's graphite: a maintenance stands out from the rentals, which keep the calendar's own colour. */
const MAINTENANCE_COLOR = '8'

/**
 * The reservation id without dashes. Google lets us choose the id of an event (a-v and 0-9, 5 to 1024
 * characters), so the same reservation always means the same event: repeating a sync never makes a double.
 */
export function eventIdFor(reservationId: string): string {
  return reservationId.split('-').join('').toLowerCase()
}

/** The event this reservation should have, or null when it should have none (cancelled, or maintenance switched off). */
export function wantedEvent(reservation: ReservationForCalendar, settings: CalendarSettings): CalendarEvent | null {
  if (reservation.status !== 'confirmed') return null
  const isMaintenance = reservation.kind === 'maintenance'
  if (isMaintenance && !settings.includeMaintenance) return null

  const days = daysBetween(reservation.startsOn, reservation.endsOn)
  const lines = isMaintenance
    ? [
        'Maintenance',
        ...(reservation.label ? [`Reason: ${reservation.label}`] : []),
        `Bike: ${reservation.bikeLabel} (${reservation.shortId})`,
      ]
    : [
        ...(reservation.customerName ? [`Customer: ${reservation.customerName}`] : []),
        ...(settings.includePhone && reservation.customerPhone ? [`Phone: ${reservation.customerPhone}`] : []),
        `Bike: ${reservation.bikeLabel} (${reservation.shortId})`,
      ]
  lines.push(`Days: ${reservation.startsOn} to ${inclusiveEnd(reservation.endsOn)} (${days} ${days === 1 ? 'day' : 'days'})`)

  const summary = isMaintenance
    ? `Maintenance · ${reservation.bikeLabel}`
    : [reservation.bikeLabel, reservation.customerName].filter(Boolean).join(' · ')

  return {
    summary,
    description: lines.join('\n'),
    start: { date: reservation.startsOn },
    end: { date: reservation.endsOn },
    ...(isMaintenance ? { colorId: MAINTENANCE_COLOR } : {}),
    reminders: { useDefault: false },
    extendedProperties: { private: { lelettricaManaged: 'true', reservationId: reservation.id } },
  }
}
