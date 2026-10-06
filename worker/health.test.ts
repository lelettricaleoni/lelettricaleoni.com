// worker/health.test.ts
import { describe, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { healthFilePath, runHealthBeat } from './health'

function run(ping: () => Promise<boolean>, beats: number) {
  const controller = new AbortController()
  const write = vi.fn(async () => { if (write.mock.calls.length >= beats) controller.abort() })
  return { controller, write, done: runHealthBeat({ ping, write, intervalMs: 5, signal: controller.signal }) }
}

describe('runHealthBeat', () => {
  it('writes the health file at every beat while Redis answers, and stops when told to', async () => {
    const { write, done } = run(async () => true, 3)
    await done
    expect(write).toHaveBeenCalledTimes(3)
  })

  it('writes nothing while Redis does not answer: a missing file is how an unhealthy worker shows', async () => {
    const controller = new AbortController()
    const write = vi.fn(async () => {})
    const done = runHealthBeat({ ping: async () => false, write, intervalMs: 5, signal: controller.signal })
    setTimeout(() => controller.abort(), 40)
    await done
    expect(write).not.toHaveBeenCalled()
  })

  it('survives a ping that throws', async () => {
    const controller = new AbortController()
    let calls = 0
    const ping = async () => { if (++calls === 2) controller.abort(); throw new Error('down') }
    await runHealthBeat({ ping, write: async () => {}, intervalMs: 5, signal: controller.signal })
    expect(calls).toBe(2)
  })
})

describe('healthFilePath', () => {
  it('is in the home folder of the user running the worker, not in a folder every user can write to', () => {
    const path = healthFilePath({})
    expect(path.endsWith('healthy')).toBe(true)
    expect(path.startsWith(tmpdir())).toBe(false)
    expect(path.startsWith('/tmp')).toBe(false)
  })

  it('can be moved with HEALTH_FILE', () => {
    expect(healthFilePath({ HEALTH_FILE: '/run/worker/ok' })).toBe('/run/worker/ok')
  })
})
