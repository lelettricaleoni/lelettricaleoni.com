import { integrationStatus, type IntegrationStatus } from '@/lib/integrations/status'
import type { IntegrationState } from '@/lib/integrations/store'

/**
 * What the browser receives about an integration: a whitelist, never the stored `config` as it is, and never
 * the secret. Dates are text, because a Server Component hands props to a Client Component as plain data.
 */
export interface IntegrationView {
  id: string
  enabled: boolean
  hasSecret: boolean
  status: IntegrationStatus
  calendarId: string
  serviceAccountEmail: string | null
  includePhone: boolean
  includeMaintenance: boolean
  connectionOk: boolean
  testedCalendarId: string
  lastCheckedAt: string | null
  lastSyncAt: string | null
  lastError: string | null
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

export function toIntegrationView(id: string, state: IntegrationState | null): IntegrationView {
  const config = state?.config ?? {}
  return {
    id,
    enabled: state?.enabled ?? false,
    hasSecret: state?.hasSecret ?? false,
    status: integrationStatus(state),
    calendarId: text(config.calendarId),
    serviceAccountEmail: typeof config.serviceAccountEmail === 'string' ? config.serviceAccountEmail : null,
    includePhone: config.includePhone === true,
    // A maintenance is in the calendar unless it was switched off.
    includeMaintenance: config.includeMaintenance !== false,
    connectionOk: config.connectionOk === true,
    testedCalendarId: text(config.testedCalendarId),
    lastCheckedAt: state?.lastCheckedAt?.toISOString() ?? null,
    lastSyncAt: state?.lastSyncAt?.toISOString() ?? null,
    lastError: state?.lastError ?? null,
  }
}
