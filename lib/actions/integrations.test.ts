import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ getAdminUser: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/integrations/crypto', () => ({ isEncryptionConfigured: vi.fn() }))
vi.mock('@/lib/integrations/store', () => ({
  getIntegrationState: vi.fn(), getDecryptedSecret: vi.fn(), saveSecret: vi.fn(), saveConfig: vi.fn(),
  setEnabled: vi.fn(), removeSecret: vi.fn(), recordCheck: vi.fn(),
}))
vi.mock('@/lib/integrations/google-calendar/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/integrations/google-calendar/client')>()),
  createCalendarApi: vi.fn(),
}))

import { getAdminUser } from '@/lib/supabase/server'
import { isEncryptionConfigured } from '@/lib/integrations/crypto'
import * as store from '@/lib/integrations/store'
import { createCalendarApi } from '@/lib/integrations/google-calendar/client'
import {
  disableIntegrationAction, enableIntegrationAction, removeCredentialsAction, saveGoogleCalendarKeyAction,
  saveGoogleCalendarSettingsAction, testGoogleCalendarAction,
} from './integrations'

const PEM = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----\n'
const EMAIL = 'calendar-sync@my-project.iam.gserviceaccount.com'
const keyFile = (overrides: Record<string, unknown> = {}) => JSON.stringify({
  type: 'service_account', project_id: 'my-project', private_key: PEM, client_email: EMAIL, client_id: 'drop-me', ...overrides,
})
const formWith = (fields: Record<string, string | File>) => {
  const form = new FormData()
  for (const [name, value] of Object.entries(fields)) form.set(name, value)
  return form
}
const state = (overrides: Partial<import('@/lib/integrations/store').IntegrationState> = {}) => ({
  id: 'google-calendar', enabled: false, config: {}, hasSecret: true, lastCheckedAt: null, lastSyncAt: null,
  lastError: null, updatedAt: new Date(), updatedBy: null, ...overrides,
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getAdminUser).mockResolvedValue({ id: 'admin-1' } as never)
  vi.mocked(isEncryptionConfigured).mockReturnValue(true)
})

describe('every integration action', () => {
  it('refuses anyone who is not an admin, and touches nothing', async () => {
    vi.mocked(getAdminUser).mockResolvedValue(null as never)
    await expect(saveGoogleCalendarKeyAction(formWith({ keyText: keyFile() }))).rejects.toThrow('Unauthorized')
    await expect(saveGoogleCalendarSettingsAction({ calendarId: 'x' })).rejects.toThrow('Unauthorized')
    await expect(testGoogleCalendarAction()).rejects.toThrow('Unauthorized')
    await expect(enableIntegrationAction('google-calendar')).rejects.toThrow('Unauthorized')
    await expect(disableIntegrationAction('google-calendar')).rejects.toThrow('Unauthorized')
    await expect(removeCredentialsAction('google-calendar')).rejects.toThrow('Unauthorized')
    expect(store.saveSecret).not.toHaveBeenCalled()
    expect(store.setEnabled).not.toHaveBeenCalled()
    expect(store.removeSecret).not.toHaveBeenCalled()
  })
})

describe('saveGoogleCalendarKeyAction', () => {
  it('encrypts and stores the key, remembers only the e-mail, and switches the integration off until it is tested', async () => {
    const result = await saveGoogleCalendarKeyAction(formWith({ keyText: keyFile() }))
    expect(result).toEqual({ status: 'saved', serviceAccountEmail: EMAIL })
    const [id, stored, by] = vi.mocked(store.saveSecret).mock.calls[0]
    expect([id, by]).toEqual(['google-calendar', 'admin-1'])
    expect(JSON.parse(stored)).toEqual({ type: 'service_account', project_id: 'my-project', private_key: PEM, client_email: EMAIL })
    expect(store.saveConfig).toHaveBeenCalledWith('google-calendar', { serviceAccountEmail: EMAIL, connectionOk: false, testedCalendarId: null }, 'admin-1')
    expect(store.setEnabled).toHaveBeenCalledWith('google-calendar', false, 'admin-1')
  })

  it('never gives the key back', async () => {
    const result = await saveGoogleCalendarKeyAction(formWith({ keyText: keyFile() }))
    expect(JSON.stringify(result)).not.toContain('PRIVATE KEY')
    expect(JSON.stringify(result)).not.toContain('MIIEvQ')
  })

  it('reads an uploaded file, and prefers it to pasted text', async () => {
    const file = new File([keyFile({ client_email: 'file@my-project.iam.gserviceaccount.com' })], 'key.json', { type: 'application/json' })
    const result = await saveGoogleCalendarKeyAction(formWith({ keyFile: file, keyText: keyFile() }))
    expect(result).toEqual({ status: 'saved', serviceAccountEmail: 'file@my-project.iam.gserviceaccount.com' })
  })

  it('says what is wrong with a file that is not a service account key, and stores nothing', async () => {
    const result = await saveGoogleCalendarKeyAction(formWith({ keyText: '{"installed":{}}' }))
    expect(result).toMatchObject({ status: 'invalid' })
    expect(store.saveSecret).not.toHaveBeenCalled()
  })

  it('refuses a huge upload without reading it', async () => {
    const huge = new File(['x'.repeat(5_000_000)], 'big.json')
    const result = await saveGoogleCalendarKeyAction(formWith({ keyFile: huge }))
    expect(result).toEqual({ status: 'invalid', message: 'This file is too big to be a key file (the limit is 10 KB).' })
    expect(store.saveSecret).not.toHaveBeenCalled()
  })

  it('refuses to save when there is no encryption key, instead of storing the secret as it is', async () => {
    vi.mocked(isEncryptionConfigured).mockReturnValue(false)
    expect(await saveGoogleCalendarKeyAction(formWith({ keyText: keyFile() }))).toEqual({ status: 'no_encryption_key' })
    expect(store.saveSecret).not.toHaveBeenCalled()
  })
})

describe('saveGoogleCalendarSettingsAction', () => {
  it('saves the calendar ID and the two options', async () => {
    vi.mocked(store.getIntegrationState).mockResolvedValue(state({ config: { calendarId: 'same@group.calendar.google.com', connectionOk: true, testedCalendarId: 'same@group.calendar.google.com' } }))
    const result = await saveGoogleCalendarSettingsAction({ calendarId: '  same@group.calendar.google.com ', includePhone: true, includeMaintenance: false })
    expect(result).toEqual({ status: 'saved' })
    expect(store.saveConfig).toHaveBeenCalledWith('google-calendar', { calendarId: 'same@group.calendar.google.com', includePhone: true, includeMaintenance: false }, 'admin-1')
  })

  it('puts the test back to "not done" and switches off when the calendar changes', async () => {
    vi.mocked(store.getIntegrationState).mockResolvedValue(state({ enabled: true, config: { calendarId: 'old', connectionOk: true, testedCalendarId: 'old' } }))
    await saveGoogleCalendarSettingsAction({ calendarId: 'new', includePhone: false, includeMaintenance: true })
    expect(store.saveConfig).toHaveBeenCalledWith('google-calendar', expect.objectContaining({ calendarId: 'new', connectionOk: false }), 'admin-1')
    expect(store.setEnabled).toHaveBeenCalledWith('google-calendar', false, 'admin-1')
  })

  it('refuses an empty calendar ID, one with spaces inside, and an absurd one', async () => {
    for (const calendarId of ['', '   ', 'two words', 'a'.repeat(300)]) {
      expect(await saveGoogleCalendarSettingsAction({ calendarId, includePhone: false, includeMaintenance: true })).toMatchObject({ status: 'invalid' })
    }
    expect(store.saveConfig).not.toHaveBeenCalled()
  })

  it('refuses options that are not yes or no', async () => {
    expect(await saveGoogleCalendarSettingsAction({ calendarId: 'x', includePhone: 'yes', includeMaintenance: true })).toMatchObject({ status: 'invalid' })
  })
})

describe('testGoogleCalendarAction', () => {
  const ready = () => {
    vi.mocked(store.getIntegrationState).mockResolvedValue(state({ config: { calendarId: 'cal@group.calendar.google.com', serviceAccountEmail: EMAIL } }))
    vi.mocked(store.getDecryptedSecret).mockResolvedValue(JSON.stringify({ type: 'service_account', project_id: 'p', private_key: PEM, client_email: EMAIL }))
  }
  const api = (overrides = {}) => ({
    readEvents: vi.fn().mockResolvedValue(undefined), createTestEvent: vi.fn().mockResolvedValue('evt'),
    deleteEvent: vi.fn().mockResolvedValue(undefined), ...overrides,
  })

  it('remembers a passing test for exactly this calendar', async () => {
    ready()
    vi.mocked(createCalendarApi).mockReturnValue(api())
    expect(await testGoogleCalendarAction()).toEqual({ status: 'ok' })
    expect(store.recordCheck).toHaveBeenCalledWith('google-calendar', null)
    expect(store.saveConfig).toHaveBeenCalledWith('google-calendar', { connectionOk: true, testedCalendarId: 'cal@group.calendar.google.com' }, 'admin-1')
  })

  it('passes a warning on, when the test event could not be removed', async () => {
    ready()
    vi.mocked(createCalendarApi).mockReturnValue(api({ deleteEvent: vi.fn().mockRejectedValue(new Error('x')) }))
    expect(await testGoogleCalendarAction()).toMatchObject({ status: 'ok', warning: expect.stringContaining('test event') })
  })

  it('records the reason and forgets any earlier success when the test fails', async () => {
    ready()
    vi.mocked(createCalendarApi).mockReturnValue(api({ readEvents: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { status: 404 })) }))
    const result = await testGoogleCalendarAction()
    expect(result).toMatchObject({ status: 'failed', message: expect.stringContaining('cannot find this calendar') })
    expect(store.recordCheck).toHaveBeenCalledWith('google-calendar', expect.stringContaining('cannot find this calendar'))
    expect(store.saveConfig).toHaveBeenCalledWith('google-calendar', { connectionOk: false, testedCalendarId: null }, 'admin-1')
  })

  it('asks for the key, and for the calendar ID, before calling Google', async () => {
    vi.mocked(store.getIntegrationState).mockResolvedValue(state({ hasSecret: false }))
    expect(await testGoogleCalendarAction()).toEqual({ status: 'invalid', message: 'Upload the service account key first.' })
    vi.mocked(store.getIntegrationState).mockResolvedValue(state({ config: {} }))
    expect(await testGoogleCalendarAction()).toEqual({ status: 'invalid', message: 'Enter the calendar ID first.' })
    expect(createCalendarApi).not.toHaveBeenCalled()
  })

  it('says the saved key cannot be read any more (another encryption key, damaged) instead of crashing', async () => {
    vi.mocked(store.getIntegrationState).mockResolvedValue(state({ config: { calendarId: 'cal' } }))
    vi.mocked(store.getDecryptedSecret).mockRejectedValue(new Error('decryption failed'))
    const result = await testGoogleCalendarAction()
    expect(result).toEqual({ status: 'invalid', message: 'The saved key can no longer be read. Upload the key file again.' })
  })

  it('does not leak the key in anything it returns', async () => {
    ready()
    vi.mocked(createCalendarApi).mockReturnValue(api({ readEvents: vi.fn().mockRejectedValue(new Error(PEM)) }))
    expect(JSON.stringify(await testGoogleCalendarAction())).not.toContain('MIIEvQ')
  })
})

describe('enable, disable and remove', () => {
  it('switches on only an integration that is ready', async () => {
    vi.mocked(store.getIntegrationState).mockResolvedValue(state({ config: { calendarId: 'c' } }))
    expect(await enableIntegrationAction('google-calendar')).toMatchObject({ status: 'invalid' })
    expect(store.setEnabled).not.toHaveBeenCalled()

    vi.mocked(store.getIntegrationState).mockResolvedValue(state({ config: { calendarId: 'c', connectionOk: true, testedCalendarId: 'c' } }))
    expect(await enableIntegrationAction('google-calendar')).toEqual({ status: 'ok' })
    expect(store.setEnabled).toHaveBeenCalledWith('google-calendar', true, 'admin-1')
  })

  it('does not know an integration that does not exist', async () => {
    expect(await enableIntegrationAction('nope')).toEqual({ status: 'invalid', message: 'Unknown integration.' })
    expect(await disableIntegrationAction('nope')).toEqual({ status: 'invalid', message: 'Unknown integration.' })
    expect(await removeCredentialsAction('nope')).toEqual({ status: 'invalid', message: 'Unknown integration.' })
  })

  it('switches off and keeps everything else', async () => {
    expect(await disableIntegrationAction('google-calendar')).toEqual({ status: 'ok' })
    expect(store.setEnabled).toHaveBeenCalledWith('google-calendar', false, 'admin-1')
    expect(store.removeSecret).not.toHaveBeenCalled()
  })

  it('removes the credentials and forgets the test and the service account', async () => {
    expect(await removeCredentialsAction('google-calendar')).toEqual({ status: 'ok' })
    expect(store.removeSecret).toHaveBeenCalledWith('google-calendar', 'admin-1')
    expect(store.saveConfig).toHaveBeenCalledWith('google-calendar', { serviceAccountEmail: null, connectionOk: false, testedCalendarId: null }, 'admin-1')
  })
})
