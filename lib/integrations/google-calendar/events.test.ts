import { describe, expect, it } from 'vitest'
import { eventIdFor, wantedEvent, type CalendarSettings, type ReservationForCalendar } from './events'

const settings = (overrides: Partial<CalendarSettings> = {}): CalendarSettings => ({
  calendarId: 'cal@group.calendar.google.com', includePhone: false, includeMaintenance: true, ...overrides,
})

const rental = (overrides: Partial<ReservationForCalendar> = {}): ReservationForCalendar => ({
  id: '5f1b0c2e-8a3d-4e7f-9b21-0c4d6e8f1a23', kind: 'counter_rental', status: 'confirmed',
  startsOn: '2026-10-10', endsOn: '2026-10-13', bikeLabel: 'Mondraker Arid S · M · Alu', shortId: 'aaaaaaaa',
  customerName: 'Mario Rossi', customerPhone: '+393471234567', label: null, ...overrides,
})

describe('eventIdFor', () => {
  it('is the reservation id without dashes: valid for Google, and the same every time', () => {
    expect(eventIdFor('5f1b0c2e-8a3d-4e7f-9b21-0c4d6e8f1a23')).toBe('5f1b0c2e8a3d4e7f9b210c4d6e8f1a23')
    expect(eventIdFor('5F1B0C2E-8A3D-4E7F-9B21-0C4D6E8F1A23')).toBe('5f1b0c2e8a3d4e7f9b210c4d6e8f1a23')
    // Google accepts only a-v and 0-9, 5 to 1024 characters.
    expect(eventIdFor(rental().id)).toMatch(/^[a-v0-9]{5,1024}$/)
  })
})

describe('wantedEvent for a rental', () => {
  it('is an all-day event on the days of the rental: the end is exclusive on both sides', () => {
    const event = wantedEvent(rental(), settings())!
    expect(event.start).toEqual({ date: '2026-10-10' })
    expect(event.end).toEqual({ date: '2026-10-13' })
  })

  it('has the bike and the customer in the title', () => {
    expect(wantedEvent(rental(), settings())!.summary).toBe('Mondraker Arid S · M · Alu · Mario Rossi')
  })

  it('describes the rental: customer, bike with its id, days included', () => {
    const { description } = wantedEvent(rental(), settings())!
    expect(description).toContain('Customer: Mario Rossi')
    expect(description).toContain('Bike: Mondraker Arid S · M · Alu (aaaaaaaa)')
    expect(description).toContain('Days: 2026-10-10 to 2026-10-12 (3 days)')
  })

  it('puts the phone number in only when the option is on', () => {
    expect(wantedEvent(rental(), settings({ includePhone: false }))!.description).not.toContain('+393471234567')
    expect(wantedEvent(rental(), settings({ includePhone: true }))!.description).toContain('Phone: +393471234567')
  })

  it('has nothing to add when the customer has no phone, even with the option on', () => {
    expect(wantedEvent(rental({ customerPhone: null }), settings({ includePhone: true }))!.description).not.toContain('Phone')
  })

  it('never carries the amount or the private notes: it is not even given them', () => {
    const json = JSON.stringify(wantedEvent(rental(), settings({ includePhone: true })))
    expect(json).not.toMatch(/amount|notes|price|€/i)
  })

  it('marks the event as ours and remembers which reservation it is, so a check never touches events added by hand', () => {
    expect(wantedEvent(rental(), settings())!.extendedProperties).toEqual({
      private: { lelettricaManaged: 'true', reservationId: rental().id },
    })
  })

  it('does not ring: no default reminders on a calendar of bookings', () => {
    expect(wantedEvent(rental(), settings())!.reminders).toEqual({ useDefault: false })
  })

  it('copes with a customer who has no name on file', () => {
    expect(wantedEvent(rental({ customerName: null }), settings())!.summary).toBe('Mondraker Arid S · M · Alu')
  })

  it('counts one day as one day', () => {
    expect(wantedEvent(rental({ startsOn: '2026-10-10', endsOn: '2026-10-11' }), settings())!.description).toContain('Days: 2026-10-10 to 2026-10-10 (1 day)')
  })
})

describe('wantedEvent for a maintenance', () => {
  const maintenance = (overrides: Partial<ReservationForCalendar> = {}) =>
    rental({ kind: 'maintenance', customerName: null, customerPhone: null, label: 'chain', ...overrides })

  it('is in the calendar, with the reason, in a different colour', () => {
    const event = wantedEvent(maintenance(), settings())!
    expect(event.summary).toBe('Maintenance · Mondraker Arid S · M · Alu')
    expect(event.description).toContain('Reason: chain')
    expect(event.colorId).toBeDefined()
    expect(wantedEvent(rental(), settings())!.colorId).toBeUndefined()
  })

  it('has no reason line when none was written', () => {
    expect(wantedEvent(maintenance({ label: null }), settings())!.description).not.toContain('Reason')
  })

  it('is not wanted when maintenance is switched off', () => {
    expect(wantedEvent(maintenance(), settings({ includeMaintenance: false }))).toBeNull()
  })
})

describe('wantedEvent for a cancelled reservation', () => {
  it('is not wanted: the event must go', () => {
    expect(wantedEvent(rental({ status: 'cancelled' }), settings())).toBeNull()
  })
})

describe('wantedEvent for an online booking', () => {
  it('shows a confirmed online rental like any other rental', () => {
    const event = wantedEvent(rental({ kind: 'online_rental' }), settings())!
    expect(event.summary).toBe('Mondraker Arid S · M · Alu · Mario Rossi')
    expect(event.start).toEqual({ date: '2026-10-10' })
  })

  it('has no event for a bike that is only held, and none for one that expired: nobody has paid yet, or ever will', () => {
    expect(wantedEvent(rental({ kind: 'online_rental', status: 'held' }), settings())).toBeNull()
    expect(wantedEvent(rental({ kind: 'online_rental', status: 'expired' }), settings())).toBeNull()
  })
})
