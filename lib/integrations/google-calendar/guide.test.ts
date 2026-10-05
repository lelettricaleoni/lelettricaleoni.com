import { describe, expect, it } from 'vitest'
import { GUIDE_STEPS, completedSteps } from './guide'

const view = (overrides = {}) => ({
  hasSecret: false, calendarId: '', connectionOk: false, testedCalendarId: '', enabled: false, ...overrides,
})

describe('the Google Calendar setup guide', () => {
  it('has numbered steps in English, each saying what to do and what you should see', () => {
    expect(GUIDE_STEPS.length).toBeGreaterThanOrEqual(8)
    const ids = GUIDE_STEPS.map((step) => step.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const step of GUIDE_STEPS) {
      expect(step.title.trim()).not.toBe('')
      expect(step.todo.length).toBeGreaterThan(0)
      expect(step.see.trim()).not.toBe('')
    }
  })

  it('only links to Google, over https', () => {
    for (const link of GUIDE_STEPS.flatMap((step) => step.links ?? [])) {
      const url = new URL(link.href)
      expect(url.protocol).toBe('https:')
      expect(url.hostname).toMatch(/(^|\.)google\.com$/)
      expect(link.label.trim()).not.toBe('')
    }
  })

  it('has a step for each field of the form, and for the test', () => {
    const fields = GUIDE_STEPS.map((step) => step.field).filter(Boolean)
    expect(fields).toEqual(expect.arrayContaining(['key', 'calendarId', 'test']))
  })

  it('does not ask anyone to put the key anywhere but in this panel', () => {
    const text = JSON.stringify(GUIDE_STEPS).toLowerCase()
    expect(text).not.toContain('environment variable')
    expect(text).not.toContain('email the')
  })
})

describe('completedSteps', () => {
  const done = (overrides = {}) => new Set(completedSteps(view(overrides)))
  const step = (field: string) => GUIDE_STEPS.find((s) => s.field === field)!.id

  it('has nothing done to begin with', () => {
    expect(done().size).toBe(0)
  })

  it('counts the Google steps as done once the key is saved: the key proves a service account exists', () => {
    const set = done({ hasSecret: true })
    expect(set.has(GUIDE_STEPS[0].id)).toBe(true)
    expect(set.has(step('key'))).toBe(true)
    expect(set.has(step('test'))).toBe(false)
  })

  it('ticks the calendar ID step when one is saved', () => {
    expect(done({ calendarId: 'cal' }).has(step('calendarId'))).toBe(true)
  })

  it('ticks the test only when it passed for the calendar that is saved now', () => {
    expect(done({ hasSecret: true, calendarId: 'cal', connectionOk: true, testedCalendarId: 'cal' }).has(step('test'))).toBe(true)
    expect(done({ hasSecret: true, calendarId: 'new', connectionOk: true, testedCalendarId: 'cal' }).has(step('test'))).toBe(false)
  })

  it('ticks the last step when the integration is on', () => {
    expect(done({ enabled: true }).has(GUIDE_STEPS[GUIDE_STEPS.length - 1].id)).toBe(true)
    expect(done().has(GUIDE_STEPS[GUIDE_STEPS.length - 1].id)).toBe(false)
  })
})
