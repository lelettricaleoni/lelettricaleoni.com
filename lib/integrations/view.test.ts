import { describe, expect, it } from 'vitest'
import { toIntegrationView } from './view'
import type { IntegrationState } from './store'

const state = (overrides: Partial<IntegrationState> = {}): IntegrationState => ({
  id: 'google-calendar', enabled: true, hasSecret: true, lastCheckedAt: new Date('2026-10-05T10:00:00Z'), lastSyncAt: null,
  lastError: null, updatedAt: new Date('2026-10-05T10:00:00Z'), updatedBy: 'admin-1',
  config: {
    calendarId: 'cal@group.calendar.google.com', serviceAccountEmail: 'sync@p.iam.gserviceaccount.com',
    includePhone: true, includeMaintenance: false, connectionOk: true, testedCalendarId: 'cal@group.calendar.google.com',
    somethingInternal: 'must-not-reach-the-browser',
  },
  ...overrides,
})

describe('toIntegrationView', () => {
  it('keeps only what the panel shows, with dates as text the browser can receive', () => {
    expect(toIntegrationView('google-calendar', state())).toEqual({
      id: 'google-calendar', enabled: true, hasSecret: true, status: 'enabled',
      calendarId: 'cal@group.calendar.google.com', serviceAccountEmail: 'sync@p.iam.gserviceaccount.com',
      includePhone: true, includeMaintenance: false, connectionOk: true, testedCalendarId: 'cal@group.calendar.google.com',
      lastCheckedAt: '2026-10-05T10:00:00.000Z', lastSyncAt: null, lastError: null,
    })
  })

  it('drops every setting it does not know', () => {
    expect(JSON.stringify(toIntegrationView('google-calendar', state()))).not.toContain('must-not-reach-the-browser')
  })

  it('has sane defaults for an integration nobody has touched', () => {
    expect(toIntegrationView('google-calendar', null)).toEqual({
      id: 'google-calendar', enabled: false, hasSecret: false, status: 'not-enabled',
      calendarId: '', serviceAccountEmail: null, includePhone: false, includeMaintenance: true, connectionOk: false,
      testedCalendarId: '', lastCheckedAt: null, lastSyncAt: null, lastError: null,
    })
  })

  it('says it needs attention when it is on and the last thing failed', () => {
    expect(toIntegrationView('google-calendar', state({ lastError: 'The calendar is not shared' })).status).toBe('needs-attention')
  })
})
