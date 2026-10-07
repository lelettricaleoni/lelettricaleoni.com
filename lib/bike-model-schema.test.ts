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

  describe("priceAdjustmentPercent", () => {
    const parse = (value: unknown) => BikeModelSchema.safeParse({ ...valid, priceAdjustmentPercent: value })

    it("is 0 when the field is left empty: the category's prices as they are", () => {
      const result = BikeModelSchema.safeParse(valid)
      expect(result.success && result.data.priceAdjustmentPercent).toBe(0)
    })

    it("takes a surcharge, a discount and a decimal, as the string a form sends", () => {
      expect(parse("10").success && parse("10").data?.priceAdjustmentPercent).toBe(10)
      expect(parse("-15").success && parse("-15").data?.priceAdjustmentPercent).toBe(-15)
      expect(parse("7.5").success && parse("7.5").data?.priceAdjustmentPercent).toBe(7.5)
    })

    it("refuses a discount of 100% or more, which would make the bike free", () => {
      expect(parse("-100").success).toBe(false)
      expect(parse("-150").success).toBe(false)
      expect(parse("-99").success).toBe(true)
    })

    it("refuses a surcharge above 300%", () => {
      expect(parse("301").success).toBe(false)
      expect(parse("300").success).toBe(true)
    })

    it("refuses what is not a number", () => {
      expect(parse("abc").success).toBe(false)
    })
  })
})