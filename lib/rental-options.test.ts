import { describe, it, expect } from 'vitest'
import { listPrice, onlyChoice, sizesOf, versionsOf, type RentalOption } from './rental-options'

const options: RentalOption[] = [
  {
    modelId: 'm1', modelName: 'Mondraker', priceByDays: [45, 80, null],
    sizes: [
      { id: 's-s', name: 'S', versions: [{ id: 'v-x', name: 'Alu' }, { id: 'v-y', name: 'Carbon' }] },
      { id: 's-m', name: 'M', versions: [{ id: 'v-x', name: 'Alu' }] },
    ],
  },
  { modelId: 'm2', modelName: 'Flyer', priceByDays: [], sizes: [{ id: 's-l', name: 'L', versions: [{ id: 'v-z', name: 'Std' }] }] },
]

describe('the cascade of choices in the rental form', () => {
  it('offers the sizes of the chosen model', () => {
    expect(sizesOf(options, 'm1').map((s) => s.id)).toEqual(['s-s', 's-m'])
    expect(sizesOf(options, 'm2').map((s) => s.id)).toEqual(['s-l'])
  })

  it('offers the versions that exist in the chosen size, not every version of the model', () => {
    expect(versionsOf(options, 'm1', 's-s').map((v) => v.id)).toEqual(['v-x', 'v-y'])
    expect(versionsOf(options, 'm1', 's-m').map((v) => v.id)).toEqual(['v-x'])
  })

  it('offers nothing for a model, or a size, that is not there', () => {
    expect(sizesOf(options, 'nope')).toEqual([])
    expect(versionsOf(options, 'm1', 'nope')).toEqual([])
    expect(versionsOf(options, 'nope', 's-s')).toEqual([])
    expect(sizesOf(options, '')).toEqual([])
  })

  it('picks for the person when there is only one choice, and never guesses otherwise', () => {
    expect(onlyChoice([{ id: 's-l' }])).toBe('s-l')
    expect(onlyChoice([{ id: 's-s' }, { id: 's-m' }])).toBe('')
    expect(onlyChoice([])).toBe('')
  })
})

describe('listPrice', () => {
  it('is the category price for that many days, in euros', () => {
    expect(listPrice(options, 'm1', 1)).toBe(45)
    expect(listPrice(options, 'm1', 2)).toBe(80)
  })

  it('is null when the category sets no price for those days, or does not rent that long', () => {
    expect(listPrice(options, 'm1', 3)).toBeNull()
    expect(listPrice(options, 'm1', 9)).toBeNull()
    expect(listPrice(options, 'm2', 1)).toBeNull()
  })

  it('is null for no days, a fraction of a day, or a model that is not there', () => {
    expect(listPrice(options, 'm1', 0)).toBeNull()
    expect(listPrice(options, 'm1', 1.5)).toBeNull()
    expect(listPrice(options, 'nope', 1)).toBeNull()
  })
})
