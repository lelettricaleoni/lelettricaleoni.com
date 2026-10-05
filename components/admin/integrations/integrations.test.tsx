import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// The pages call Server Actions that talk to the database and to Google: none of that runs in a static render.
vi.mock('@/lib/actions/integrations', () => ({
  enableIntegrationAction: vi.fn(), disableIntegrationAction: vi.fn(), removeCredentialsAction: vi.fn(),
  saveGoogleCalendarKeyAction: vi.fn(), saveGoogleCalendarSettingsAction: vi.fn(), testGoogleCalendarAction: vi.fn(),
}))

import { IntegrationsCatalog } from './catalog'
import { IntegrationPage } from './integration-page'
import { GoogleCalendarSettings } from './google-calendar-settings'
import { GuideSteps } from './guide-steps'
import { INTEGRATIONS } from '@/lib/integrations/registry'
import { GUIDE_STEPS } from '@/lib/integrations/google-calendar/guide'
import type { IntegrationView } from '@/lib/integrations/view'

const google = INTEGRATIONS[0]
const view = (overrides: Partial<IntegrationView> = {}): IntegrationView => ({
  id: 'google-calendar', enabled: false, hasSecret: false, status: 'not-enabled', calendarId: '', serviceAccountEmail: null,
  includePhone: false, includeMaintenance: true, connectionOk: false, testedCalendarId: '', lastCheckedAt: null,
  lastSyncAt: null, lastError: null, ...overrides,
})

describe('the catalogue', () => {
  const html = renderToStaticMarkup(createElement(IntegrationsCatalog, { entries: [{ definition: google, status: 'not-enabled' }] }))

  it('shows each integration as a card that opens its page, with its name, what it does and its status', () => {
    expect(html).toContain('href="/manage/integrations/google-calendar"')
    expect(html).toContain('Google Calendar')
    expect(html).toContain(google.summary)
    expect(html).toContain('Not enabled')
  })

  it('shows the other statuses too', () => {
    const on = renderToStaticMarkup(createElement(IntegrationsCatalog, { entries: [{ definition: google, status: 'enabled' }] }))
    const bad = renderToStaticMarkup(createElement(IntegrationsCatalog, { entries: [{ definition: google, status: 'needs-attention' }] }))
    expect(on).toContain('Enabled')
    expect(bad).toContain('Needs attention')
  })
})

describe('the page of an integration', () => {
  const page = (v: IntegrationView, encryptionConfigured = true) =>
    renderToStaticMarkup(createElement(IntegrationPage, { definition: google, view: v, encryptionConfigured }))

  it('offers Enable when it is off and Disable when it is on', () => {
    expect(page(view())).toContain('>Enable<')
    expect(page(view())).not.toContain('>Disable<')
    expect(page(view({ enabled: true, status: 'enabled' }))).toContain('>Disable<')
  })

  it('has the four tabs', () => {
    const html = page(view())
    for (const name of ['Overview', 'Setup guide', 'Settings', 'Activity']) expect(html).toContain(`>${name}<`)
  })

  it('says on the Overview what it does, what is sent and what is never done', () => {
    const html = page(view())
    expect(html).toContain('What is sent')
    expect(html).toContain('What is never done')
    expect(html).toContain('customer name')
    expect(html).toContain('never sends the amount')
  })
})

describe('the settings tab', () => {
  const settings = (v: IntegrationView, encryptionConfigured = true) =>
    renderToStaticMarkup(createElement(GoogleCalendarSettings, { view: v, encryptionConfigured }))

  it('has the guide next to the form: the steps and the fields', () => {
    const html = settings(view())
    expect(html).toContain('Setup guide')
    expect(html).toContain(GUIDE_STEPS[0].title)
    for (const label of ['Service account key', 'Calendar ID', 'Test connection', 'Save key', 'Save settings']) expect(html).toContain(label)
  })

  it('shows "Key saved" and the service account e-mail once there is a key, and nothing else of it', () => {
    const html = settings(view({ hasSecret: true, serviceAccountEmail: 'sync@p.iam.gserviceaccount.com' }))
    expect(html).toContain('Key saved')
    expect(html).toContain('sync@p.iam.gserviceaccount.com')
    expect(html).toContain('Remove credentials')
    expect(html).not.toContain('PRIVATE KEY')
  })

  it('offers no way to remove credentials when there are none', () => {
    expect(settings(view())).not.toContain('Remove credentials')
  })

  it('warns, and blocks the key fields, when secure storage is not set up, without naming the setting', () => {
    const html = settings(view(), false)
    expect(html).toContain('Keys cannot be saved yet')
    expect(html).not.toContain('INTEGRATIONS_ENCRYPTION_KEY')
    expect(html).toMatch(/<input[^>]*id="key-file"[^>]*disabled/)
  })

  it('shows the saved calendar ID and the options', () => {
    const html = settings(view({ calendarId: 'cal@group.calendar.google.com', includePhone: true }))
    expect(html).toContain('value="cal@group.calendar.google.com"')
  })

  it('ticks the steps that are done', () => {
    const html = settings(view({ hasSecret: true, calendarId: 'c', connectionOk: true, testedCalendarId: 'c' }))
    expect(html.match(/data-done="true"/g)?.length).toBeGreaterThanOrEqual(7)
  })
})

describe('the guide', () => {
  it('shows every step with what to do and what you should see, and only ticks the ones that are done', () => {
    const html = renderToStaticMarkup(createElement(GuideSteps, { completed: [GUIDE_STEPS[0].id] }))
    for (const step of GUIDE_STEPS) expect(html).toContain(step.title)
    expect(html.match(/What you should see:/g)).toHaveLength(GUIDE_STEPS.length)
    expect(html.match(/data-done="true"/g)).toHaveLength(1)
  })

  it('opens the Google links in a new tab without handing over the opener', () => {
    const html = renderToStaticMarkup(createElement(GuideSteps, { completed: [] }))
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noreferrer noopener"')
  })
})
