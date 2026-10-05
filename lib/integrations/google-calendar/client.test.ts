import { describe, expect, it, vi } from 'vitest'
import { explainGoogleError, testConnection, type CalendarApi } from './client'

/** The shape of the errors the Google client throws (checked against its own error class). */
const googleError = (status: number, reason: string, message = 'x') =>
  Object.assign(new Error(message), { code: status, status, response: { status, data: { error: { code: status, message, errors: [{ reason }] } } } })

const EMAIL = 'calendar-sync@my-project.iam.gserviceaccount.com'

describe('explainGoogleError', () => {
  it('says the Calendar API is not enabled, and where', () => {
    const message = explainGoogleError(googleError(403, 'accessNotConfigured', 'Google Calendar API has not been used in project 123 before or it is disabled.'), EMAIL)
    expect(message).toMatch(/Google Calendar API is not enabled/)
  })

  it('says the calendar cannot be found, naming the service account to share it with', () => {
    const message = explainGoogleError(googleError(404, 'notFound'), EMAIL)
    expect(message).toMatch(/cannot find this calendar/)
    expect(message).toContain(EMAIL)
  })

  it('says the service account may only read when it cannot write', () => {
    for (const reason of ['forbidden', 'writeAccessRequired', 'requiredAccessLevel', 'insufficientPermissions']) {
      expect(explainGoogleError(googleError(403, reason), EMAIL)).toMatch(/Make changes to events/)
    }
  })

  it('says the key was rejected when Google refuses the sign-in', () => {
    expect(explainGoogleError(Object.assign(new Error('invalid_grant: Invalid JWT Signature.'), { response: { status: 400, data: { error: 'invalid_grant' } } }), EMAIL))
      .toMatch(/rejected this key/)
    expect(explainGoogleError(googleError(401, 'authError'), EMAIL)).toMatch(/rejected this key/)
  })

  it('says it could not reach Google when the network fails', () => {
    expect(explainGoogleError(Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }), EMAIL)).toMatch(/Could not reach Google/)
    expect(explainGoogleError(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }), EMAIL)).toMatch(/Could not reach Google/)
  })

  it('gives the HTTP status for anything else, and nothing from the message', () => {
    const message = explainGoogleError(googleError(500, 'backendError', 'secret-detail-from-google'), EMAIL)
    expect(message).toContain('500')
    expect(message).not.toContain('secret-detail-from-google')
  })

  it('copes with something that is not even an error', () => {
    expect(explainGoogleError('boom', EMAIL)).toMatch(/unexpected/i)
    expect(explainGoogleError(undefined, EMAIL)).toMatch(/unexpected/i)
  })
})

describe('testConnection', () => {
  const api = (overrides: Partial<CalendarApi> = {}): CalendarApi => ({
    readEvents: vi.fn().mockResolvedValue(undefined),
    createTestEvent: vi.fn().mockResolvedValue('evt-1'),
    deleteEvent: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  })

  it('reads the calendar, writes a test event and removes it', async () => {
    const calendar = api()
    expect(await testConnection(calendar, 'cal@group.calendar.google.com', EMAIL)).toEqual({ ok: true })
    expect(calendar.readEvents).toHaveBeenCalledWith('cal@group.calendar.google.com')
    expect(calendar.createTestEvent).toHaveBeenCalledWith('cal@group.calendar.google.com')
    expect(calendar.deleteEvent).toHaveBeenCalledWith('cal@group.calendar.google.com', 'evt-1')
  })

  it('stops at the first failure and explains it, without trying to write', async () => {
    const calendar = api({ readEvents: vi.fn().mockRejectedValue(googleError(404, 'notFound')) })
    const result = await testConnection(calendar, 'wrong', EMAIL)
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.message).toMatch(/cannot find this calendar/)
    expect(calendar.createTestEvent).not.toHaveBeenCalled()
  })

  it('says the service account cannot change the calendar when the write is refused', async () => {
    const calendar = api({ createTestEvent: vi.fn().mockRejectedValue(googleError(403, 'forbidden')) })
    const result = await testConnection(calendar, 'cal', EMAIL)
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.message).toMatch(/Make changes to events/)
  })

  it('still succeeds, with a warning, when the test event could not be removed', async () => {
    const calendar = api({ deleteEvent: vi.fn().mockRejectedValue(googleError(500, 'backendError')) })
    const result = await testConnection(calendar, 'cal', EMAIL)
    expect(result).toMatchObject({ ok: true })
    if (result.ok) expect(result.warning).toMatch(/test event/i)
  })

  it('refuses an empty calendar id before calling Google', async () => {
    const calendar = api()
    expect(await testConnection(calendar, '   ', EMAIL)).toMatchObject({ ok: false })
    expect(calendar.readEvents).not.toHaveBeenCalled()
  })
})
