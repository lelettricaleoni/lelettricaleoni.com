import { describe, expect, it } from 'vitest'
import { applyReservation, reconcile, removeReservationEvent, type SyncApi } from './engine'
import { eventIdFor, type CalendarEvent, type CalendarSettings, type ReservationForCalendar } from './events'

const CAL = 'cal@group.calendar.google.com'
const settings = (overrides: Partial<CalendarSettings> = {}): CalendarSettings => ({ calendarId: CAL, includePhone: false, includeMaintenance: true, ...overrides })

const reservation = (id: string, overrides: Partial<ReservationForCalendar> = {}): ReservationForCalendar => ({
  id, kind: 'counter_rental', status: 'confirmed', startsOn: '2026-10-10', endsOn: '2026-10-13',
  bikeLabel: 'Mondraker Arid S · M · Alu', shortId: 'aaaaaaaa', customerName: 'Mario Rossi', customerPhone: null, label: null,
  ...overrides,
})
const ID1 = '11111111-1111-4111-8111-111111111111'
const ID2 = '22222222-2222-4222-8222-222222222222'
const ID3 = '33333333-3333-4333-8333-333333333333'

/** A calendar in memory that behaves like Google's: events by id, some of them not ours. */
function fakeCalendar(foreign: string[] = []) {
  const events = new Map<string, CalendarEvent | 'foreign'>(foreign.map((id) => [id, 'foreign' as const]))
  const calls: string[] = []
  const api: SyncApi = {
    async upsertEvent(calendarId, eventId, event) {
      calls.push(`upsert ${eventId}`)
      expect(calendarId).toBe(CAL)
      const existed = events.has(eventId)
      events.set(eventId, event)
      return existed ? 'updated' : 'created'
    },
    async removeEvent(_calendarId, eventId) {
      calls.push(`remove ${eventId}`)
      const had = events.get(eventId)
      events.delete(eventId)
      return had ? 'removed' : 'absent'
    },
    async listManagedEventIds() {
      return [...events.entries()].filter(([, event]) => event !== 'foreign').map(([id]) => id)
    },
  }
  return { api, events, calls }
}

describe('applyReservation', () => {
  it('creates the event for a confirmed reservation, with the id derived from the reservation', async () => {
    const { api, events } = fakeCalendar()
    expect(await applyReservation(api, settings(), reservation(ID1))).toBe('created')
    expect([...events.keys()]).toEqual([eventIdFor(ID1)])
  })

  it('updates the same event, not a second one, when it is applied again or the reservation changed', async () => {
    const { api, events } = fakeCalendar()
    await applyReservation(api, settings(), reservation(ID1))
    expect(await applyReservation(api, settings(), reservation(ID1, { bikeLabel: 'Flyer · L · Std', shortId: 'bbbbbbbb' }))).toBe('updated')
    expect(events.size).toBe(1)
    expect((events.get(eventIdFor(ID1)) as CalendarEvent).summary).toContain('Flyer')
  })

  it('removes the event of a reservation that was cancelled', async () => {
    const { api, events } = fakeCalendar()
    await applyReservation(api, settings(), reservation(ID1))
    expect(await applyReservation(api, settings(), reservation(ID1, { status: 'cancelled' }))).toBe('removed')
    expect(events.size).toBe(0)
  })

  it('says "absent" and does not fail when a cancelled reservation has no event, or twice', async () => {
    const { api } = fakeCalendar()
    expect(await applyReservation(api, settings(), reservation(ID1, { status: 'cancelled' }))).toBe('absent')
    expect(await applyReservation(api, settings(), reservation(ID1, { status: 'cancelled' }))).toBe('absent')
  })

  it('keeps maintenance out of the calendar when that is switched off, and removes one already there', async () => {
    const { api, events } = fakeCalendar()
    const maintenance = reservation(ID2, { kind: 'maintenance', customerName: null })
    await applyReservation(api, settings(), maintenance)
    expect(events.size).toBe(1)
    await applyReservation(api, settings({ includeMaintenance: false }), maintenance)
    expect(events.size).toBe(0)
  })
})

describe('removeReservationEvent', () => {
  it('removes the event of a reservation that no longer exists at all', async () => {
    const { api, events } = fakeCalendar()
    await applyReservation(api, settings(), reservation(ID1))
    expect(await removeReservationEvent(api, settings(), ID1)).toBe('removed')
    expect(events.size).toBe(0)
  })
})

describe('reconcile', () => {
  const window = { from: '2026-10-01', to: '2027-10-01' }
  const describeError = (error: unknown) => (error instanceof Error ? error.message : 'unexpected')

  it('creates what is missing and leaves what is right', async () => {
    const { api, events } = fakeCalendar()
    await applyReservation(api, settings(), reservation(ID1))
    const report = await reconcile(api, settings(), [reservation(ID1), reservation(ID2)], window, describeError)
    expect(report).toEqual({ upserted: 2, removed: 0, failed: 0, firstError: null })
    expect(events.size).toBe(2)
  })

  it('removes the events of reservations that are no longer in the list, e.g. one cancelled while Google was down', async () => {
    const { api, events } = fakeCalendar()
    await applyReservation(api, settings(), reservation(ID1))
    await applyReservation(api, settings(), reservation(ID3))
    const report = await reconcile(api, settings(), [reservation(ID1)], window, describeError)
    expect(report.removed).toBe(1)
    expect([...events.keys()]).toEqual([eventIdFor(ID1)])
  })

  it('never touches an event somebody added by hand to the same calendar', async () => {
    const { api, events, calls } = fakeCalendar(['dentist-appointment'])
    await reconcile(api, settings(), [reservation(ID1)], window, describeError)
    expect(events.has('dentist-appointment')).toBe(true)
    expect(calls).not.toContain('remove dentist-appointment')
  })

  it('removes events of maintenance that is now switched off, even if the reservation is still confirmed', async () => {
    const { api, events } = fakeCalendar()
    const maintenance = reservation(ID2, { kind: 'maintenance', customerName: null })
    await applyReservation(api, settings(), maintenance)
    await reconcile(api, settings({ includeMaintenance: false }), [maintenance], window, describeError)
    expect(events.size).toBe(0)
  })

  it('goes on after a failure, counts it and keeps the first reason', async () => {
    const { api, events } = fakeCalendar()
    const failing: SyncApi = {
      ...api,
      async upsertEvent(calendarId, eventId, event) {
        if (eventId === eventIdFor(ID1)) throw new Error('quota exceeded')
        return api.upsertEvent(calendarId, eventId, event)
      },
    }
    const report = await reconcile(failing, settings(), [reservation(ID1), reservation(ID2)], window, describeError)
    expect(report).toMatchObject({ upserted: 1, failed: 1, firstError: 'quota exceeded' })
    expect(events.has(eventIdFor(ID2))).toBe(true)
  })

  it('does not remove anything when it could not read the calendar: no list means no guesses', async () => {
    const { api, events } = fakeCalendar()
    await applyReservation(api, settings(), reservation(ID3))
    const blind: SyncApi = { ...api, async listManagedEventIds() { throw new Error('forbidden') } }
    const report = await reconcile(blind, settings(), [reservation(ID1)], window, describeError)
    expect(report.failed).toBeGreaterThan(0)
    expect(report.firstError).toBe('forbidden')
    expect(events.has(eventIdFor(ID3))).toBe(true)
  })

  it('does nothing for no reservations and an empty calendar', async () => {
    const { api } = fakeCalendar()
    expect(await reconcile(api, settings(), [], window, describeError)).toEqual({ upserted: 0, removed: 0, failed: 0, firstError: null })
  })
})
