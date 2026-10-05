import { describe, expect, it } from 'vitest'
import { INTEGRATIONS, getIntegrationDefinition } from './registry'

describe('the integrations registry', () => {
  it('lists Google Calendar', () => {
    expect(INTEGRATIONS.map((i) => i.id)).toContain('google-calendar')
  })

  it('gives every integration a unique id and everything the catalogue and its page show', () => {
    const ids = INTEGRATIONS.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const integration of INTEGRATIONS) {
      expect(integration.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(integration.name.trim()).not.toBe('')
      expect(integration.summary.trim()).not.toBe('')
      expect(integration.description.trim()).not.toBe('')
      expect(integration.dataSent.length).toBeGreaterThan(0)
      expect(integration.notDone.length).toBeGreaterThan(0)
    }
  })

  it('says in plain words what leaves for the outside service, and never promises to send secrets', () => {
    const google = getIntegrationDefinition('google-calendar')!
    expect(google.dataSent.join(' ')).toMatch(/customer name/i)
    expect(google.notDone.join(' ')).toMatch(/amount/i)
    expect(google.notDone.join(' ')).toMatch(/note/i)
  })

  it('finds an integration by id and knows when there is none', () => {
    expect(getIntegrationDefinition('google-calendar')?.name).toBe('Google Calendar')
    expect(getIntegrationDefinition('nope')).toBeUndefined()
    expect(getIntegrationDefinition('')).toBeUndefined()
  })
})
