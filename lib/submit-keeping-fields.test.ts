import { describe, it, expect, vi, afterEach } from 'vitest'
import type { FormEvent } from 'react'
import { submitKeepingFields } from './submit-keeping-fields'

class FakeFormData {
  constructor(public readonly source: unknown) {}
}

afterEach(() => vi.unstubAllGlobals())

describe('submitKeepingFields', () => {
  function submit() {
    vi.stubGlobal('FormData', FakeFormData)
    const formAction = vi.fn()
    const form = { name: 'the form' }
    const event = { preventDefault: vi.fn(), currentTarget: form } as unknown as FormEvent<HTMLFormElement>
    submitKeepingFields(formAction)(event)
    return { formAction, form, event }
  }

  it('stops the native submit, so React never resets the form after the action', () => {
    const { event } = submit()
    expect(event.preventDefault).toHaveBeenCalledOnce()
  })

  it('hands the form data to the action', () => {
    const { formAction, form } = submit()
    expect(formAction).toHaveBeenCalledOnce()
    const payload = formAction.mock.calls[0][0] as FakeFormData
    expect(payload).toBeInstanceOf(FakeFormData)
    expect(payload.source).toBe(form)
  })
})
