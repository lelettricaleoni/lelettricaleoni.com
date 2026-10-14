import { describe, expect, it } from 'vitest'
import type { BookableModel } from './catalog'
import { cartLines, cartTotalCents, quantityOf, sanitizeCart, totalBikes, withQuantity } from './cart'

const M1 = '3f2a1c9e-8b7d-4e6f-9a10-2b3c4d5e6f70'
const M2 = '11111111-2222-4333-8444-555555555555'
const SM = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const SL = '22222222-3333-4444-8555-666666666666'
const V1 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const V2 = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff'

const spec = (bikeModelId: string, bikeSizeId: string, bikeVersionId: string) => ({ bikeModelId, bikeSizeId, bikeVersionId })

const models: BookableModel[] = [
  {
    id: M1, name: 'Uproc', categoryId: 'c1', categoryName: 'eMTB', days: 3, stayPriceCents: 2400, maxDays: 7, tooLong: false, totalFree: 5,
    variants: [
      { sizeId: SM, sizeName: 'M', chooseVersion: true, versions: [{ versionId: V1, versionName: 'Unisex', free: 2 }, { versionId: V2, versionName: 'Donna', free: 1 }] },
      { sizeId: SL, sizeName: 'L', chooseVersion: false, versions: [{ versionId: V1, versionName: 'Unisex', free: 2 }] },
    ],
  },
  {
    id: M2, name: 'Gravel', categoryId: 'c2', categoryName: 'Gravel', days: 3, stayPriceCents: null, maxDays: 2, tooLong: true, totalFree: 3,
    variants: [{ sizeId: SM, sizeName: 'M', chooseVersion: false, versions: [{ versionId: V1, versionName: 'Unisex', free: 3 }] }],
  },
]

describe('the cart of the booking page', () => {
  it('counts the bikes in all and of one kind', () => {
    const cart = [{ ...spec(M1, SM, V1), quantity: 2 }, { ...spec(M1, SL, V1), quantity: 1 }]
    expect(totalBikes(cart)).toBe(3)
    expect(quantityOf(cart, spec(M1, SM, V1))).toBe(2)
    expect(quantityOf(cart, spec(M1, SM, V2))).toBe(0)
  })

  it('sets the quantity of a kind, adding it when new and removing it at zero', () => {
    let cart = withQuantity([], spec(M1, SM, V1), 1, 2)
    expect(cart).toEqual([{ ...spec(M1, SM, V1), quantity: 1 }])
    cart = withQuantity(cart, spec(M1, SM, V1), 2, 2)
    expect(cart).toEqual([{ ...spec(M1, SM, V1), quantity: 2 }])
    expect(withQuantity(cart, spec(M1, SM, V1), 0, 2)).toEqual([])
  })

  it('never goes above the bikes free of that kind, nor below zero, nor to a fraction', () => {
    expect(withQuantity([], spec(M1, SM, V1), 5, 2)).toEqual([{ ...spec(M1, SM, V1), quantity: 2 }])
    expect(withQuantity([{ ...spec(M1, SM, V1), quantity: 2 }], spec(M1, SM, V1), -3, 2)).toEqual([])
    expect(withQuantity([], spec(M1, SM, V1), 1.7, 2)).toEqual([{ ...spec(M1, SM, V1), quantity: 1 }])
  })

  it('never lets the whole cart pass ten bikes', () => {
    const cart = [{ ...spec(M1, SL, V1), quantity: 8 }]
    const next = withQuantity(cart, spec(M1, SM, V1), 5, 20)
    expect(totalBikes(next)).toBe(10)
    expect(quantityOf(next, spec(M1, SM, V1))).toBe(2)
  })

  it('drops from an address what is not bookable now, and clamps what is free less than asked', () => {
    const cart = [
      { ...spec(M1, SM, V1), quantity: 5 }, // only 2 free
      { ...spec(M2, SM, V1), quantity: 1 }, // the model cannot be rented that long
      { ...spec('99999999-9999-4999-8999-999999999999', SM, V1), quantity: 1 }, // not in the list
      { ...spec(M1, SL, V2), quantity: 1 }, // a version this size has not
    ]
    expect(sanitizeCart(cart, models)).toEqual([{ ...spec(M1, SM, V1), quantity: 2 }])
  })

  it('describes each line with names and amounts, and adds them up in cents', () => {
    const cart = [{ ...spec(M1, SM, V2), quantity: 1 }, { ...spec(M1, SL, V1), quantity: 2 }]
    const lines = cartLines(cart, models)
    expect(lines).toEqual([
      { ...spec(M1, SM, V2), quantity: 1, modelName: 'Uproc', sizeName: 'M', versionName: 'Donna', unitCents: 2400, lineCents: 2400 },
      { ...spec(M1, SL, V1), quantity: 2, modelName: 'Uproc', sizeName: 'L', versionName: null, unitCents: 2400, lineCents: 4800 },
    ])
    expect(cartTotalCents(lines)).toBe(7200)
  })
})
