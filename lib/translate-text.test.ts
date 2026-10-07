import { describe, it, expect, vi, beforeEach } from 'vitest'

const translateFromItalian = vi.fn()
vi.mock('@/lib/actions/translate', () => ({ translateFromItalian: (...a: unknown[]) => translateFromItalian(...a) }))

import { translateNameAndDescription } from './translate-text'

beforeEach(() => {
  translateFromItalian.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('translateNameAndDescription', () => {
  it('returns both translations', async () => {
    translateFromItalian
      .mockResolvedValueOnce({ en: 'Name', de: 'Name DE' })
      .mockResolvedValueOnce({ en: 'Description', de: 'Beschreibung' })
    const result = await translateNameAndDescription('Nome', 'Descrizione')
    expect(result).toEqual({
      ok: true,
      name: { en: 'Name', de: 'Name DE' },
      description: { en: 'Description', de: 'Beschreibung' },
    })
  })

  it('returns a message, and does not throw, when the translator refuses', async () => {
    translateFromItalian.mockRejectedValue(new Error('Azure Translator error: 429'))
    const result = await translateNameAndDescription('Nome', 'Descrizione')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('nothing was saved')
  })

  it('does the same for a text over the limit', async () => {
    translateFromItalian.mockRejectedValue(new Error('Text exceeds 5000 character limit'))
    const result = await translateNameAndDescription('Nome', 'x'.repeat(6000))
    expect(result.ok).toBe(false)
  })

  it('keeps a line break from the error out of the log', async () => {
    translateFromItalian.mockRejectedValue(new Error('bad\r\nforged line'))
    await translateNameAndDescription('Nome', 'Descrizione')
    const logged = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls[0].map(String).join(' ')
    expect(logged).not.toMatch(/[\r\n]/)
  })
})
