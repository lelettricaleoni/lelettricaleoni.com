import { describe, expect, it } from 'vitest'
import { cartSchema, checkStay, expandCart, MAX_BIKES_PER_BOOKING } from './rules'

const TODAY = '2031-07-01'

describe('checkStay', () => {
  it('accepts a stay that starts tomorrow, and counts its days (the end is exclusive)', () => {
    expect(checkStay('2031-07-02', '2031-07-05', TODAY)).toEqual({ ok: true, days: 3 })
  })

  it('refuses a stay that starts today or before: the same day is the shop\'s, at the counter', () => {
    expect(checkStay('2031-07-01', '2031-07-03', TODAY)).toEqual({ ok: false, reason: 'too_soon' })
    expect(checkStay('2031-06-20', '2031-07-03', TODAY)).toEqual({ ok: false, reason: 'too_soon' })
  })

  it('refuses an end that is not after the start', () => {
    expect(checkStay('2031-07-05', '2031-07-05', TODAY)).toEqual({ ok: false, reason: 'not_a_range' })
    expect(checkStay('2031-07-05', '2031-07-03', TODAY)).toEqual({ ok: false, reason: 'not_a_range' })
  })

  it('refuses what is not a day', () => {
    expect(checkStay('2031-7-2', '2031-07-05', TODAY)).toEqual({ ok: false, reason: 'invalid_date' })
    expect(checkStay('2031-07-02', 'tomorrow', TODAY)).toEqual({ ok: false, reason: 'invalid_date' })
    expect(checkStay('2031-02-30', '2031-03-05', TODAY)).toEqual({ ok: false, reason: 'invalid_date' })
  })

  it('allows the last day to be 180 days from today, and not one more', () => {
    // today + 180 = 2031-12-28; the end is exclusive, so 2031-12-29 is the latest end.
    expect(checkStay('2031-12-26', '2031-12-29', TODAY)).toEqual({ ok: true, days: 3 })
    expect(checkStay('2031-12-26', '2031-12-30', TODAY)).toEqual({ ok: false, reason: 'too_far' })
  })
})

const model = '11111111-1111-4111-8111-111111111111'
const size = '22222222-2222-4222-8222-222222222222'
const version = '33333333-3333-4333-8333-333333333333'
const item = (quantity: number) => ({ bikeModelId: model, bikeSizeId: size, bikeVersionId: version, quantity })

describe('cartSchema', () => {
  it('accepts a cart of one to ten bikes in total', () => {
    expect(cartSchema.safeParse([item(1)]).success).toBe(true)
    expect(cartSchema.safeParse([item(4), item(6)]).success).toBe(true)
  })

  it(`refuses an empty cart, a quantity of 0, and more than ${MAX_BIKES_PER_BOOKING} bikes in total`, () => {
    expect(cartSchema.safeParse([]).success).toBe(false)
    expect(cartSchema.safeParse([item(0)]).success).toBe(false)
    expect(cartSchema.safeParse([item(5), item(6)]).success).toBe(false)
    expect(cartSchema.safeParse([item(11)]).success).toBe(false)
  })

  it('refuses ids that are not ids, and a quantity that is not a whole number', () => {
    expect(cartSchema.safeParse([{ ...item(1), bikeModelId: 'abc' }]).success).toBe(false)
    expect(cartSchema.safeParse([item(1.5)]).success).toBe(false)
    expect(cartSchema.safeParse([{ ...item(1), bikeSizeId: undefined }]).success).toBe(false)
  })
})

describe('expandCart', () => {
  it('makes one entry per bike, in the order of the cart', () => {
    const other = { ...item(1), bikeSizeId: '44444444-4444-4444-8444-444444444444' }
    const lines = expandCart([item(2), other])
    expect(lines).toHaveLength(3)
    expect(lines[0]).toEqual({ bikeModelId: model, bikeSizeId: size, bikeVersionId: version })
    expect(lines[2].bikeSizeId).toBe(other.bikeSizeId)
    expect(lines[0]).not.toHaveProperty('quantity')
  })
})
