import { describe, expect, it } from 'vitest'
import { checkoutHref, parseRentState, rentHref } from './rent-url'

const MODEL = '3f2a1c9e-8b7d-4e6f-9a10-2b3c4d5e6f70'
const SIZE = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const VERSION = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const OTHER = '11111111-2222-4333-8444-555555555555'
const spec = { bikeModelId: MODEL, bikeSizeId: SIZE, bikeVersionId: VERSION }

describe('the state of the booking page lives in the address', () => {
  it('reads the days as first and last day, and keeps the end exclusive inside', () => {
    expect(parseRentState({ from: '2031-11-03', to: '2031-11-05' }).range).toEqual({ startsOn: '2031-11-03', endsOn: '2031-11-06' })
    expect(parseRentState({ from: '2031-11-03', to: '2031-11-03' }).range).toEqual({ startsOn: '2031-11-03', endsOn: '2031-11-04' })
  })

  it('ignores days that are not a real range: not a date, last before first, one day only given', () => {
    expect(parseRentState({ from: 'tomorrow', to: '2031-11-05' }).range).toBeNull()
    expect(parseRentState({ from: '2031-02-30', to: '2031-03-02' }).range).toBeNull()
    expect(parseRentState({ from: '2031-11-05', to: '2031-11-03' }).range).toBeNull()
    expect(parseRentState({ from: '2031-11-05' }).range).toBeNull()
    expect(parseRentState({}).range).toBeNull()
  })

  it('reads the cart as model.size.version.quantity, comma separated', () => {
    expect(parseRentState({ b: `${MODEL}.${SIZE}.${VERSION}.2` }).cart).toEqual([{ ...spec, quantity: 2 }])
    expect(parseRentState({ b: `${MODEL}.${SIZE}.${VERSION}.1,${OTHER}.${SIZE}.${VERSION}.3` }).cart).toEqual([
      { ...spec, quantity: 1 }, { bikeModelId: OTHER, bikeSizeId: SIZE, bikeVersionId: VERSION, quantity: 3 },
    ])
  })

  it('adds the quantities of the same bike asked twice', () => {
    expect(parseRentState({ b: `${MODEL}.${SIZE}.${VERSION}.2,${MODEL}.${SIZE}.${VERSION}.3` }).cart).toEqual([{ ...spec, quantity: 5 }])
  })

  it('throws away what is not a bike: broken ids, quantity 0, negative, fractional, huge, missing parts', () => {
    const bad = [`nope.${SIZE}.${VERSION}.1`, `${MODEL}.${SIZE}.${VERSION}.0`, `${MODEL}.${SIZE}.${VERSION}.-1`, `${MODEL}.${SIZE}.${VERSION}.1.5`, `${MODEL}.${SIZE}.${VERSION}.99`, `${MODEL}.${SIZE}.1`, '']
    for (const entry of bad) expect(parseRentState({ b: entry }).cart, entry).toEqual([])
    expect(parseRentState({ b: `${MODEL}.${SIZE}.${VERSION}.1,garbage` }).cart).toEqual([{ ...spec, quantity: 1 }])
  })

  it('never lets the cart pass ten bikes in all', () => {
    const state = parseRentState({ b: `${MODEL}.${SIZE}.${VERSION}.8,${OTHER}.${SIZE}.${VERSION}.8` })
    expect(state.cart.reduce((sum, item) => sum + item.quantity, 0)).toBeLessThanOrEqual(10)
    expect(state.cart[0].quantity).toBe(8)
  })

  it('takes the first value when a parameter is repeated, and reads a model to start from', () => {
    expect(parseRentState({ from: ['2031-11-03', '2031-12-01'], to: '2031-11-04' }).range).toEqual({ startsOn: '2031-11-03', endsOn: '2031-11-05' })
    expect(parseRentState({ model: MODEL }).focusModelId).toBe(MODEL)
    expect(parseRentState({ model: 'x' }).focusModelId).toBeNull()
  })

  it('writes the address back in the same shape, and reading it gives the same state', () => {
    const state = parseRentState({ from: '2031-11-03', to: '2031-11-05', b: `${MODEL}.${SIZE}.${VERSION}.2` })
    const href = rentHref('it', state)
    expect(href).toBe(`/it/rent?from=2031-11-03&to=2031-11-05&b=${MODEL}.${SIZE}.${VERSION}.2`)
    const back = Object.fromEntries(new URL(href, 'https://example.test').searchParams)
    expect(parseRentState(back)).toEqual(state)
  })

  it('writes only what is there: no days, no bikes, no empty parameters', () => {
    expect(rentHref('en', { range: null, cart: [], focusModelId: null })).toBe('/en/rent')
    expect(rentHref('de', { range: null, cart: [], focusModelId: MODEL })).toBe(`/de/rent?model=${MODEL}`)
    // The checkout page keeps the days and the bikes and leaves out the model a person arrived from.
    expect(checkoutHref('it', { range: { startsOn: '2031-11-03', endsOn: '2031-11-06' }, cart: [{ bikeModelId: MODEL, bikeSizeId: MODEL, bikeVersionId: MODEL, quantity: 2 }], focusModelId: MODEL }))
      .toBe(`/it/rent/checkout?from=2031-11-03&to=2031-11-05&b=${MODEL}.${MODEL}.${MODEL}.2`)
  })
})
