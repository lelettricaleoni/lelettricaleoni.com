import { describe, expect, it } from 'vitest'
import { canEnable, integrationStatus } from './status'
import type { IntegrationState } from './store'

const state = (overrides: Partial<IntegrationState> = {}): IntegrationState => ({
  id: 'google-calendar', enabled: false, config: {}, hasSecret: false, lastCheckedAt: null, lastSyncAt: null,
  lastError: null, updatedAt: new Date(), updatedBy: null, ...overrides,
})

describe('integrationStatus', () => {
  it('is not enabled for an integration that was never touched, or is switched off', () => {
    expect(integrationStatus(null)).toBe('not-enabled')
    expect(integrationStatus(state())).toBe('not-enabled')
    expect(integrationStatus(state({ hasSecret: true }))).toBe('not-enabled')
  })

  it('is enabled when it is on and nothing is wrong', () => {
    expect(integrationStatus(state({ enabled: true }))).toBe('enabled')
  })

  it('needs attention when it is on and the last thing it did failed', () => {
    expect(integrationStatus(state({ enabled: true, lastError: 'The calendar is not shared' }))).toBe('needs-attention')
  })

  it('does not call an integration that is off "needing attention" because of an old error', () => {
    expect(integrationStatus(state({ enabled: false, lastError: 'old' }))).toBe('not-enabled')
  })
})

describe('canEnable (Google Calendar)', () => {
  const ready = () => state({
    hasSecret: true,
    config: { calendarId: 'cal@group.calendar.google.com', connectionOk: true, testedCalendarId: 'cal@group.calendar.google.com' },
  })

  it('allows it once the connection test passed for the calendar that is saved', () => {
    expect(canEnable('google-calendar', ready())).toEqual({ ok: true })
  })

  it('asks for the key first', () => {
    expect(canEnable('google-calendar', null)).toEqual({ ok: false, message: 'Upload the service account key first.' })
    expect(canEnable('google-calendar', state({ hasSecret: false }))).toEqual({ ok: false, message: 'Upload the service account key first.' })
  })

  it('asks for the calendar ID', () => {
    expect(canEnable('google-calendar', state({ hasSecret: true }))).toEqual({ ok: false, message: 'Enter the calendar ID first.' })
  })

  it('asks for a successful test, also after the calendar ID or the key changed', () => {
    const untested = state({ hasSecret: true, config: { calendarId: 'cal' } })
    expect(canEnable('google-calendar', untested)).toEqual({ ok: false, message: 'Run "Test connection" and wait for it to succeed first.' })
    const changed = state({ hasSecret: true, config: { calendarId: 'other', connectionOk: true, testedCalendarId: 'cal' } })
    expect(canEnable('google-calendar', changed)).toEqual({ ok: false, message: 'Run "Test connection" and wait for it to succeed first.' })
  })

  it('does not know an integration that does not exist', () => {
    expect(canEnable('nope', ready())).toEqual({ ok: false, message: 'Unknown integration.' })
  })
})
