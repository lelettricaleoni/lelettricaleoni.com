import { describe, expect, it } from 'vitest'
import { addDaysTo, todayInRome } from '@/lib/dates'

/**
 * A check against the REAL Google Calendar configured in the panel (the development database holds its key).
 * It is skipped unless asked for, so CI and `npm test` never touch Google:
 *
 *   LIVE_GOOGLE_CALENDAR=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/integrations/google-calendar/live.test.ts
 *
 * It only creates events dated 2031 and a test event for today, and removes everything it made.
 */
describe.skipIf(!process.env.LIVE_GOOGLE_CALENDAR)('Google Calendar, for real', () => {
  async function open() {
    const { getDecryptedSecret, getIntegrationState } = await import('@/lib/integrations/store')
    const { createCalendarApi, createSyncApi } = await import('@/lib/integrations/google-calendar/client')
    const state = await getIntegrationState('google-calendar')
    const secret = await getDecryptedSecret('google-calendar')
    if (!state || !secret) throw new Error('Google Calendar is not configured in this database')
    const key = JSON.parse(secret)
    return { calendarId: String(state.config.calendarId), sync: createSyncApi(key), plain: createCalendarApi(key) }
  }

  const reservation = (id: string, overrides = {}) => ({
    id, kind: 'counter_rental' as const, status: 'confirmed' as const, startsOn: '2031-03-10', endsOn: '2031-03-13',
    bikeLabel: 'Live check · M · Alu', shortId: 'livecheck', customerName: 'Live Check', customerPhone: '+390000000000', label: null,
    ...overrides,
  })
  const settings = (calendarId: string) => ({ calendarId, includePhone: true, includeMaintenance: true })

  it('creates, updates, removes and brings back an event, and a check cleans up what it must and nothing else', async () => {
    const { applyReservation, reconcile } = await import('@/lib/integrations/google-calendar/engine')
    const { eventIdFor } = await import('@/lib/integrations/google-calendar/events')
    const { calendarId, sync, plain } = await open()
    const s = settings(calendarId)
    const id = crypto.randomUUID()
    const orphan = crypto.randomUUID()
    const window = { from: '2031-03-01', to: '2031-04-01' }
    const describeError = (error: unknown) => String(error)
    try {
      expect(await applyReservation(sync, s, reservation(id))).toBe('created')
      expect(await applyReservation(sync, s, reservation(id, { bikeLabel: 'Live check changed' }))).toBe('updated')
      expect(await sync.listManagedEventIds(calendarId, window.from, window.to)).toContain(eventIdFor(id))

      expect(await applyReservation(sync, s, reservation(id, { status: 'cancelled' }))).toBe('removed')
      expect(await applyReservation(sync, s, reservation(id, { status: 'cancelled' }))).toBe('absent')
      // The same reservation, confirmed again: Google keeps the id of a deleted event, and it comes back.
      expect(await applyReservation(sync, s, reservation(id))).toBe('updated')

      // An event of ours that matches no reservation goes.
      await applyReservation(sync, s, reservation(orphan))
      const report = await reconcile(sync, s, [reservation(id)], window, describeError)
      expect(report.failed).toBe(0)
      const left = await sync.listManagedEventIds(calendarId, window.from, window.to)
      expect(left).toContain(eventIdFor(id))
      expect(left).not.toContain(eventIdFor(orphan))

      // One that is not ours (the connection test marks its own, differently) is never touched by a check.
      const foreignId = await plain.createTestEvent(calendarId)
      const around = { from: addDaysTo(todayInRome(), -1), to: addDaysTo(todayInRome(), 2) }
      const second = await reconcile(sync, s, [], around, describeError)
      expect(second.failed).toBe(0)
      // Had the check removed it, deleting it now would fail with "already deleted".
      await expect(plain.deleteEvent(calendarId, foreignId)).resolves.toBeUndefined()
    } finally {
      await sync.removeEvent(calendarId, eventIdFor(id))
      await sync.removeEvent(calendarId, eventIdFor(orphan))
    }
  }, 60_000)
})
