import { describe, it, expect } from 'vitest'
import { BikeModelSchema } from './bike-model-schema'
import { TRANSLATION_MAX_CHARS } from './translate-text'

const valid = {
  nameIt: 'Flyer Uproc 2',
  descriptionIt: 'Una descrizione abbastanza lunga.',
  categoryId: '11111111-1111-4111-8111-111111111111',
  sizeIds: ['22222222-2222-4222-8222-222222222222'],
  versionIds: ['33333333-3333-4333-8333-333333333333'],
}

describe('BikeModelSchema', () => {
  it('accepts a description at the translator limit', () => {
    const result = BikeModelSchema.safeParse({ ...valid, descriptionIt: 'x'.repeat(TRANSLATION_MAX_CHARS) })
    expect(result.success).toBe(true)
  })

  it('refuses a longer one with a message the form can show next to the field', () => {
    const result = BikeModelSchema.safeParse({ ...valid, descriptionIt: 'x'.repeat(TRANSLATION_MAX_CHARS + 1) })
    expect(result.success).toBe(false)
    if (!result.success) {
      const message = result.error.flatten().fieldErrors.descriptionIt?.[0] ?? ''
      expect(message).toContain('too long')
      expect(message).toContain(String(TRANSLATION_MAX_CHARS))
    }
  })

  it('still wants at least one size and one version', () => {
    const result = BikeModelSchema.safeParse({ ...valid, sizeIds: [], versionIds: [] })
    expect(result.success).toBe(false)
  })
})
