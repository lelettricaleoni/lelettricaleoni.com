import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/integrations/store', () => ({ getIntegrationState: vi.fn(), getDecryptedSecret: vi.fn(), recordSync: vi.fn() }))
vi.mock('@/lib/integrations/google-calendar/data', () => ({
  getReservationForCalendar: vi.fn(), listReservationsForCalendar: vi.fn(), listReservationIdsOfCustomer: vi.fn(), listModelsForLabels: vi.fn(),
}))
vi.mock('@/lib/integrations/google-calendar/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/integrations/google-calendar/client')>()),
  createSyncApi: vi.fn(),
}))

import * as store from '@/lib/integrations/store'
import * as data from '@/lib/integrations/google-calendar/data'
import { createSyncApi } from '@/lib/integrations/google-calendar/client'
import { eventIdFor, type ReservationForCalendar } from '@/lib/integrations/google-calendar/events'
import { MAINTENANCE_LABEL_ID } from './labels'
import { syncCustomerReservations, syncModelLabels, syncNow, syncReservation } from './sync'

const PEM = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----\n'
const EMAIL = 'sync@p.iam.gserviceaccount.com'
const ID1 = '11111111-1111-4111-8111-111111111111'
const ID2 = '22222222-2222-4222-8222-222222222222'

const reservation = (id = ID1, overrides: Partial<ReservationForCalendar> = {}): ReservationForCalendar => ({
  id, kind: 'counter_rental', status: 'confirmed', startsOn: '2026-10-10', endsOn: '2026-10-13',
  bikeLabel: 'Mondraker Arid S · M · Alu', modelId: '99999999-9999-4999-8999-999999999999', modelColor: '#039be5', shortId: 'aaaaaaaa', customerName: 'Mario Rossi', customerPhone: '+393471234567', label: null,
  ...overrides,
})

const enabled = (config: Record<string, unknown> = {}) => ({
  id: 'google-calendar', enabled: true, hasSecret: true, lastCheckedAt: null, lastSyncAt: null, lastError: null,
  updatedAt: new Date(), updatedBy: null,
  config: { calendarId: 'cal@group.calendar.google.com', includePhone: true, includeMaintenance: true, ...config },
})

function fakeApi() {
  return {
    upsertEvent: vi.fn().mockResolvedValue('created'),
    removeEvent: vi.fn().mockResolvedValue('removed'),
    listManagedEventIds: vi.fn().mockResolvedValue([]),
    readLabels: vi.fn().mockResolvedValue([]),
    writeLabels: vi.fn().mockResolvedValue(undefined),
  }
}

const MODEL = '99999999-9999-4999-8999-999999999999'
const forbidden = () => Object.assign(new Error('owner access needed'), { response: { status: 403, data: { error: { errors: [{ reason: 'requiredAccessLevel' }] } } } })

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(store.getDecryptedSecret).mockResolvedValue(JSON.stringify({ type: 'service_account', project_id: 'p', private_key: PEM, client_email: EMAIL }))
  vi.mocked(data.listModelsForLabels).mockResolvedValue([{ id: MODEL, name: 'Mondraker Arid S', color: '#039be5' }])
})

describe('syncReservation', () => {
  it('does nothing at all when the integration is off, or not set up', async () => {
    vi.mocked(store.getIntegrationState).mockResolvedValue({ ...enabled(), enabled: false })
    await syncReservation(ID1)
    vi.mocked(store.getIntegrationState).mockResolvedValue(null)
    await syncReservation(ID1)
    vi.mocked(store.getIntegrationState).mockResolvedValue(enabled({ calendarId: '' }))
    await syncReservation(ID1)
    expect(createSyncApi).not.toHaveBeenCalled()
    expect(store.recordSync).not.toHaveBeenCalled()
  })

  it('sends the reservation to the calendar, with the options of the integration, and records the success', async () => {
    const api = fakeApi()
    vi.mocked(createSyncApi).mockReturnValue(api)
    vi.mocked(store.getIntegrationState).mockResolvedValue(enabled({ includePhone: true }))
    vi.mocked(data.getReservationForCalendar).mockResolvedValue(reservation())
    await syncReservation(ID1)
    expect(api.upsertEvent).toHaveBeenCalledWith('cal@group.calendar.google.com', eventIdFor(ID1), expect.objectContaining({ summary: 'Mondraker Arid S · M · Alu · Mario Rossi' }), true)
    expect(api.upsertEvent.mock.calls[0][2].description).toContain('Phone: +393471234567')
    expect(store.recordSync).toHaveBeenCalledWith('google-calendar', null)
  })

  it('leaves the phone out when that option is off', async () => {
    const api = fakeApi()
    vi.mocked(createSyncApi).mockReturnValue(api)
    vi.mocked(store.getIntegrationState).mockResolvedValue(enabled({ includePhone: false }))
    vi.mocked(data.getReservationForCalendar).mockResolvedValue(reservation())
    await syncReservation(ID1)
    expect(api.upsertEvent.mock.calls[0][2].description).not.toContain('+39')
  })

  it('removes the event of a reservation that is not in the database any more', async () => {
    const api = fakeApi()
    vi.mocked(createSyncApi).mockReturnValue(api)
    vi.mocked(store.getIntegrationState).mockResolvedValue(enabled())
    vi.mocked(data.getReservationForCalendar).mockResolvedValue(null)
    await syncReservation(ID1)
    expect(api.removeEvent).toHaveBeenCalledWith('cal@group.calendar.google.com', eventIdFor(ID1))
  })

  it('removes the event of a cancelled reservation', async () => {
    const api = fakeApi()
    vi.mocked(createSyncApi).mockReturnValue(api)
    vi.mocked(store.getIntegrationState).mockResolvedValue(enabled())
    vi.mocked(data.getReservationForCalendar).mockResolvedValue(reservation(ID1, { status: 'cancelled' }))
    await syncReservation(ID1)
    expect(api.removeEvent).toHaveBeenCalled()
    expect(api.upsertEvent).not.toHaveBeenCalled()
  })

  it('never throws when Google fails: it records a plain reason and the booking is untouched', async () => {
    const api = fakeApi()
    api.upsertEvent.mockRejectedValue(Object.assign(new Error('quota secret-detail'), { status: 404, response: { status: 404, data: { error: { errors: [{ reason: 'notFound' }] } } } }))
    vi.mocked(createSyncApi).mockReturnValue(api)
    vi.mocked(store.getIntegrationState).mockResolvedValue(enabled())
    vi.mocked(data.getReservationForCalendar).mockResolvedValue(reservation())
    await expect(syncReservation(ID1)).resolves.toBeUndefined()
    const [, message] = vi.mocked(store.recordSync).mock.calls[0]
    expect(message).toContain('cannot find this calendar')
    expect(message).not.toContain('secret-detail')
  })

  it('never throws when the database fails either', async () => {
    vi.mocked(store.getIntegrationState).mockRejectedValue(new Error('db down'))
    await expect(syncReservation(ID1)).resolves.toBeUndefined()
  })

  it('records that the saved key can no longer be read instead of crashing', async () => {
    vi.mocked(store.getIntegrationState).mockResolvedValue(enabled())
    vi.mocked(store.getDecryptedSecret).mockRejectedValue(new Error('decryption failed'))
    await expect(syncReservation(ID1)).resolves.toBeUndefined()
    expect(store.recordSync).toHaveBeenCalledWith('google-calendar', 'The saved key can no longer be read. Upload the key file again.')
  })
})

describe('syncCustomerReservations', () => {
  it('sends again every reservation of a customer whose name or phone changed', async () => {
    const api = fakeApi()
    vi.mocked(createSyncApi).mockReturnValue(api)
    vi.mocked(store.getIntegrationState).mockResolvedValue(enabled())
    vi.mocked(data.listReservationIdsOfCustomer).mockResolvedValue([ID1, ID2])
    vi.mocked(data.getReservationForCalendar).mockImplementation(async (id) => reservation(id))
    await syncCustomerReservations('customer-1')
    expect(api.upsertEvent.mock.calls.map((call) => call[1])).toEqual([eventIdFor(ID1), eventIdFor(ID2)])
  })

  it('does not even look at the database when the integration is off', async () => {
    vi.mocked(store.getIntegrationState).mockResolvedValue({ ...enabled(), enabled: false })
    await syncCustomerReservations('customer-1')
    expect(data.listReservationIdsOfCustomer).not.toHaveBeenCalled()
  })
})

describe('syncNow', () => {
  it('says it is off when the integration is off', async () => {
    vi.mocked(store.getIntegrationState).mockResolvedValue({ ...enabled(), enabled: false })
    expect(await syncNow()).toEqual({ status: 'off' })
  })

  it('brings the calendar in line with the reservations of the next twelve months, and reports', async () => {
    const api = fakeApi()
    api.listManagedEventIds.mockResolvedValue([eventIdFor(ID2)])  // an event of ours with no reservation: must go
    vi.mocked(createSyncApi).mockReturnValue(api)
    vi.mocked(store.getIntegrationState).mockResolvedValue(enabled())
    vi.mocked(data.listReservationsForCalendar).mockResolvedValue([reservation(ID1)])
    const result = await syncNow()
    expect(result).toEqual({ status: 'done', report: { upserted: 1, removed: 1, failed: 0, firstError: null } })
    expect(api.removeEvent).toHaveBeenCalledWith('cal@group.calendar.google.com', eventIdFor(ID2))
    expect(store.recordSync).toHaveBeenCalledWith('google-calendar', null)
    const [from, to] = vi.mocked(data.listReservationsForCalendar).mock.calls[0]
    expect(new Date(to).getTime() - new Date(from).getTime()).toBeGreaterThan(360 * 86_400_000)
  })

  it('records the first problem when something failed', async () => {
    const api = fakeApi()
    api.upsertEvent.mockRejectedValue(Object.assign(new Error('x'), { status: 403, response: { status: 403, data: { error: { errors: [{ reason: 'forbidden' }] } } } }))
    vi.mocked(createSyncApi).mockReturnValue(api)
    vi.mocked(store.getIntegrationState).mockResolvedValue(enabled())
    vi.mocked(data.listReservationsForCalendar).mockResolvedValue([reservation(ID1)])
    const result = await syncNow()
    expect(result).toMatchObject({ status: 'done', report: { failed: 1 } })
    expect(vi.mocked(store.recordSync).mock.calls[0][1]).toContain('Make changes to events')
  })
})

describe('the colours of the bikes', () => {
  async function run(api: ReturnType<typeof fakeApi>) {
    vi.mocked(createSyncApi).mockReturnValue(api)
    vi.mocked(store.getIntegrationState).mockResolvedValue(enabled())
    vi.mocked(data.getReservationForCalendar).mockResolvedValue(reservation())
    await syncReservation(ID1)
  }

  it('adds the label of the model and the maintenance one to the calendar, keeps the others, and writes the event with its label', async () => {
    const api = fakeApi()
    const byHand = { id: '00000000-0000-4000-8000-000000000001', backgroundColor: '#112233', name: 'By hand' }
    api.readLabels.mockResolvedValue([byHand])
    await run(api)
    const [calendarId, written] = api.writeLabels.mock.calls[0]
    expect(calendarId).toBe('cal@group.calendar.google.com')
    expect(written).toEqual([
      byHand,
      { id: MODEL, backgroundColor: '#039be5', name: 'Mondraker Arid S' },
      { id: MAINTENANCE_LABEL_ID, backgroundColor: '#616161', name: 'Maintenance' },
    ])
    expect(api.upsertEvent.mock.calls[0][2]).toMatchObject({ eventLabelId: MODEL })
    expect(api.upsertEvent.mock.calls[0][3]).toBe(true)
    expect(store.recordSync).toHaveBeenCalledWith('google-calendar', null)
  })

  it('writes nothing when the calendar already has the labels', async () => {
    const api = fakeApi()
    api.readLabels.mockResolvedValue([
      { id: MODEL, backgroundColor: '#039be5', name: 'Mondraker Arid S' },
      { id: MAINTENANCE_LABEL_ID, backgroundColor: '#616161', name: 'Maintenance' },
    ])
    await run(api)
    expect(api.writeLabels).not.toHaveBeenCalled()
    expect(api.upsertEvent.mock.calls[0][3]).toBe(true)
  })

  it('falls back on the fixed colours when the service account may not define labels, and says what to do', async () => {
    const api = fakeApi()
    api.writeLabels.mockRejectedValue(forbidden())
    await run(api)
    expect(api.upsertEvent.mock.calls[0][2]).toMatchObject({ colorId: '9' })
    expect(api.upsertEvent.mock.calls[0][2]).not.toHaveProperty('eventLabelId')
    expect(api.upsertEvent.mock.calls[0][3]).toBe(false)
    const [, message] = vi.mocked(store.recordSync).mock.calls[0]
    expect(message).toContain(EMAIL)
    expect(message).toContain('Make changes and manage sharing')
  })

  it('still sends the event when the labels cannot even be read', async () => {
    const api = fakeApi()
    api.readLabels.mockRejectedValue(Object.assign(new Error('boom'), { code: 'ETIMEDOUT' }))
    await run(api)
    expect(api.upsertEvent).toHaveBeenCalled()
    expect(api.upsertEvent.mock.calls[0][3]).toBe(false)
    expect(vi.mocked(store.recordSync).mock.calls[0][1]).toContain('fixed colours')
  })

  it('does not write labels when the calendar would pass the limit, and falls back', async () => {
    const api = fakeApi()
    api.readLabels.mockResolvedValue(Array.from({ length: 200 }, (_, n) => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, backgroundColor: '#112233' })))
    await run(api)
    expect(api.writeLabels).not.toHaveBeenCalled()
    expect(api.upsertEvent.mock.calls[0][3]).toBe(false)
    expect(vi.mocked(store.recordSync).mock.calls[0][1]).toContain('too many labels')
  })

  it('syncModelLabels brings the labels in line and sends no event', async () => {
    const api = fakeApi()
    vi.mocked(createSyncApi).mockReturnValue(api)
    vi.mocked(store.getIntegrationState).mockResolvedValue(enabled())
    await syncModelLabels()
    expect(api.writeLabels).toHaveBeenCalledTimes(1)
    expect(api.upsertEvent).not.toHaveBeenCalled()
  })

  it('does nothing when the integration is off', async () => {
    vi.mocked(store.getIntegrationState).mockResolvedValue({ ...enabled(), enabled: false })
    await syncModelLabels()
    expect(createSyncApi).not.toHaveBeenCalled()
  })

  it('"Sync now" sets the labels first and then every event with them', async () => {
    const api = fakeApi()
    vi.mocked(createSyncApi).mockReturnValue(api)
    vi.mocked(store.getIntegrationState).mockResolvedValue(enabled())
    vi.mocked(data.listReservationsForCalendar).mockResolvedValue([reservation(ID1)])
    await syncNow()
    expect(api.writeLabels).toHaveBeenCalled()
    expect(api.upsertEvent.mock.calls[0][3]).toBe(true)
  })
})
