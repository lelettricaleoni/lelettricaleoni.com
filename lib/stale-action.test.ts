import { describe, it, expect } from 'vitest'
import { shouldReloadForStaleAction, STALE_RELOAD_COOLDOWN_MS } from './stale-action'

describe('shouldReloadForStaleAction', () => {
  it('reloads the first time', () => {
    expect(shouldReloadForStaleAction(null, 1_000_000)).toBe(true)
  })

  it('does not reload again right after a reload, so a broken action cannot loop', () => {
    expect(shouldReloadForStaleAction(1_000_000, 1_000_000 + 1_000)).toBe(false)
    expect(shouldReloadForStaleAction(1_000_000, 1_000_000 + STALE_RELOAD_COOLDOWN_MS)).toBe(false)
  })

  it('reloads again once the cooldown has passed: a later deploy is a new case', () => {
    expect(shouldReloadForStaleAction(1_000_000, 1_000_000 + STALE_RELOAD_COOLDOWN_MS + 1)).toBe(true)
  })
})
