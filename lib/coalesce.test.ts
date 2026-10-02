import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { coalesce } from './coalesce'

describe('coalesce', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('runs once for any number of calls inside the window, after the window', () => {
    const run = vi.fn()
    const call = coalesce(run, 250)
    for (let i = 0; i < 20; i++) call()

    expect(run).not.toHaveBeenCalled()
    vi.advanceTimersByTime(249)
    expect(run).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('does not run at all if never called', () => {
    const run = vi.fn()
    coalesce(run, 250)
    vi.advanceTimersByTime(1000)
    expect(run).not.toHaveBeenCalled()
  })

  it('lets the next window run again', () => {
    const run = vi.fn()
    const call = coalesce(run, 250)
    call()
    vi.advanceTimersByTime(250)
    call()
    vi.advanceTimersByTime(250)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('never starves: a flood of calls still gets a run every window, at most', () => {
    const run = vi.fn()
    const call = coalesce(run, 250)
    // 100 calls a second, for two seconds: what anyone with the public channel could send.
    for (let i = 0; i < 200; i++) {
      call()
      vi.advanceTimersByTime(10)
    }
    vi.advanceTimersByTime(250)
    expect(run.mock.calls.length).toBeGreaterThanOrEqual(7)
    expect(run.mock.calls.length).toBeLessThanOrEqual(9)
  })

  it('can be cancelled, so a closed page does not reload later', () => {
    const run = vi.fn()
    const call = coalesce(run, 250)
    call()
    call.cancel()
    vi.advanceTimersByTime(1000)
    expect(run).not.toHaveBeenCalled()
  })
})
