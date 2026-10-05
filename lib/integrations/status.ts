import { getIntegrationDefinition } from '@/lib/integrations/registry'
import type { IntegrationState } from '@/lib/integrations/store'

export type IntegrationStatus = 'not-enabled' | 'enabled' | 'needs-attention'

/** What the card and the page show. A switched-off integration is never "needing attention". */
export function integrationStatus(state: IntegrationState | null): IntegrationStatus {
  if (!state?.enabled) return 'not-enabled'
  return state.lastError ? 'needs-attention' : 'enabled'
}

export type Readiness = { ok: true } | { ok: false; message: string }

/**
 * Whether an integration may be switched on. For Google Calendar: the key is saved, the calendar ID is set,
 * and the connection test passed for THIS calendar (changing the ID or the key puts the test back to "not
 * done"). Nothing is switched on by hope.
 */
export function canEnable(id: string, state: IntegrationState | null): Readiness {
  if (!getIntegrationDefinition(id)) return { ok: false, message: 'Unknown integration.' }
  if (id === 'google-calendar') {
    if (!state?.hasSecret) return { ok: false, message: 'Upload the service account key first.' }
    const calendarId = typeof state.config.calendarId === 'string' ? state.config.calendarId.trim() : ''
    if (calendarId === '') return { ok: false, message: 'Enter the calendar ID first.' }
    if (state.config.connectionOk !== true || state.config.testedCalendarId !== calendarId) {
      return { ok: false, message: 'Run "Test connection" and wait for it to succeed first.' }
    }
  }
  return { ok: true }
}
